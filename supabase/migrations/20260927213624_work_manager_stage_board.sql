-- Keep workflow position separate from operational attention status.
-- Historic blocked/attention rows intentionally stay unplaced instead of guessing.
alter table public.work_items
  add column if not exists workflow_stage text;

update public.work_items
set workflow_stage = case status
  when 'new' then 'ready'
  when 'in_progress' then 'in_progress'
  when 'done' then 'done'
  else null
end
where workflow_stage is null;

alter table public.work_items
  alter column workflow_stage set default 'ready';

alter table public.work_items
  drop constraint if exists work_items_workflow_stage_check;
alter table public.work_items
  add constraint work_items_workflow_stage_check
  check (workflow_stage is null or workflow_stage in ('ready', 'in_progress', 'client_review', 'done'));

create index if not exists work_items_client_channel_stage_updated
  on public.work_items(client_id, channel_id, workflow_stage, updated_at desc);

alter table public.work_item_events drop constraint if exists work_item_events_action_check;
alter table public.work_item_events add constraint work_item_events_action_check
  check (action in (
    'created', 'updated', 'status_changed', 'evidence_added', 'ingested',
    'automation_proposed', 'dismissed', 'restored', 'routed', 'commented',
    'workflow_stage_changed'
  ));

create or replace function public.transition_work_item(
  p_client_id text,
  p_item_id text,
  p_actor_user_id text,
  p_event_id text,
  p_action text,
  p_target_stage text default null,
  p_expected_stage text default null,
  p_blocker_text text default null,
  p_completion_evidence_url text default null,
  p_share_with_client boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item public.work_items%rowtype;
  v_before jsonb;
  v_existing_event public.work_item_events%rowtype;
  v_status text;
  v_completed_at timestamptz;
  v_blocker text;
begin
  if nullif(btrim(p_event_id), '') is null then
    raise exception using errcode = '22023', message = 'A transition event ID is required.';
  end if;

  select * into v_existing_event
  from public.work_item_events
  where id = p_event_id;
  if found then
    if v_existing_event.client_id <> p_client_id
       or v_existing_event.item_id <> p_item_id
       or v_existing_event.action <> 'workflow_stage_changed' then
      raise exception using errcode = '23505', message = 'This transition ID was already used for another action.';
    end if;
    select * into v_item from public.work_items
    where id = p_item_id and client_id = p_client_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'Work item not found in this client.';
    end if;
    return to_jsonb(v_item);
  end if;

  select * into v_item
  from public.work_items
  where id = p_item_id and client_id = p_client_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Work item not found in this client.';
  end if;
  -- A concurrent retry can pass the first event lookup before the original
  -- transaction commits; recheck after taking the item lock before comparing
  -- the expected stage, so a committed retry returns success instead of a
  -- misleading stale-stage conflict.
  select * into v_existing_event
  from public.work_item_events
  where id = p_event_id;
  if found then
    if v_existing_event.client_id <> p_client_id
       or v_existing_event.item_id <> p_item_id
       or v_existing_event.action <> 'workflow_stage_changed' then
      raise exception using errcode = '23505', message = 'This transition ID was already used for another action.';
    end if;
    return to_jsonb(v_item);
  end if;
  if v_item.workflow_stage is distinct from p_expected_stage then
    raise exception using errcode = '40001', message = 'This work item changed elsewhere. Refresh and try again.';
  end if;

  v_before := to_jsonb(v_item);
  v_blocker := nullif(btrim(coalesce(p_blocker_text, '')), '');

  if p_action = 'move' then
    if p_target_stage is null or p_target_stage not in ('ready', 'in_progress', 'client_review', 'done') then
      raise exception using errcode = '22023', message = 'Choose a valid workflow stage.';
    end if;
    if p_target_stage = 'client_review' and not v_item.client_visible and not p_share_with_client then
      raise exception using errcode = '42501', message = 'Confirm sharing this task before moving it to Client Review.';
    end if;
    if p_target_stage = 'done' and coalesce(nullif(btrim(p_completion_evidence_url), ''), v_item.completion_evidence_url) is null then
      raise exception using errcode = '23514', message = 'Add a proof link before marking this Done.';
    end if;
    v_status := case p_target_stage
      when 'ready' then 'new'
      when 'done' then 'done'
      else 'in_progress'
    end;
    v_completed_at := case when p_target_stage = 'done' then coalesce(v_item.completed_at, now()) else null end;
    update public.work_items
      set workflow_stage = p_target_stage,
          status = v_status,
          blocker_text = null,
          completion_evidence_url = coalesce(nullif(btrim(p_completion_evidence_url), ''), completion_evidence_url),
          client_visible = client_visible or (p_target_stage = 'client_review' and p_share_with_client),
          completed_at = v_completed_at,
          automation_review_needed = false,
          updated_by_user_id = p_actor_user_id,
          updated_at = now()
      where id = p_item_id and client_id = p_client_id
      returning * into v_item;
  elsif p_action = 'block' then
    if v_blocker is null then
      raise exception using errcode = '23514', message = 'Describe what would unblock this work.';
    end if;
    update public.work_items
      set status = 'blocked', blocker_text = v_blocker,
          completed_at = null, updated_by_user_id = p_actor_user_id, updated_at = now()
      where id = p_item_id and client_id = p_client_id
      returning * into v_item;
  elsif p_action = 'resume' then
    if v_item.status <> 'blocked' then
      raise exception using errcode = '22023', message = 'Only blocked work can be resumed.';
    end if;
    if v_item.workflow_stage is null then
      raise exception using errcode = '22023', message = 'Choose a workflow stage before resuming this older task.';
    end if;
    v_status := case v_item.workflow_stage when 'ready' then 'new' when 'done' then 'done' else 'in_progress' end;
    update public.work_items
      set status = v_status, blocker_text = null,
          completed_at = case when v_status = 'done' then coalesce(completed_at, now()) else null end,
          updated_by_user_id = p_actor_user_id, updated_at = now()
      where id = p_item_id and client_id = p_client_id
      returning * into v_item;
  else
    raise exception using errcode = '22023', message = 'Choose Move, Block, or Resume.';
  end if;

  insert into public.work_item_events (
    id, client_id, item_id, actor_user_id, action, before_json, after_json,
    source_evidence_url, created_at
  ) values (
    p_event_id, p_client_id, p_item_id, p_actor_user_id, 'workflow_stage_changed',
    v_before, to_jsonb(v_item), coalesce(v_item.completion_evidence_url, v_item.source_url), now()
  );

  return to_jsonb(v_item);
end;
$$;

revoke all on function public.transition_work_item(text, text, text, text, text, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.transition_work_item(text, text, text, text, text, text, text, text, text, boolean) to service_role;
