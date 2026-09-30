-- Keep an incomplete command in its original Slack thread so the author can
-- supply only missing details. The original message timestamp remains the
-- permanent task identity when the draft is completed.
create table public.work_slack_command_drafts (
  source_id text not null references public.work_sources(id) on delete cascade,
  external_id text not null,
  thread_ts text not null,
  user_ref text not null,
  source_url text not null,
  command_kind text not null default 'add'
    check (command_kind in ('add', 'status')),
  assembled_text text not null,
  last_reply_external_id text,
  revision integer not null default 0,
  state text not null default 'pending'
    check (state in ('pending', 'processing', 'completed')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_id, external_id)
);

create index work_slack_command_drafts_expiry
  on public.work_slack_command_drafts (expires_at);

create index work_slack_command_drafts_pending_thread
  on public.work_slack_command_drafts (source_id, thread_ts, user_ref)
  where state <> 'completed';

alter table public.work_slack_command_drafts enable row level security;
revoke all on public.work_slack_command_drafts from anon, authenticated;
grant select, insert, update, delete on public.work_slack_command_drafts to service_role;

-- Keep design commands in their own internal intake lane until an exact client
-- and workstream are resolved. Abort instead of guessing a different project.
do $$
begin
  if not exists (
    select 1 from public.work_sources
    where id = 'source-slack-developer-requests'
      and workspace_ref = 'T09EZFPHN'
      and source_ref = 'C072BE92C4X'
      and client_id = 'circleclick-internal'
  ) then
    raise exception 'CircleClick developer-requests source mapping was not found';
  end if;
end $$;

insert into public.work_channels (id, client_id, name, slug, description, source_kind, active)
values ('design-requests', 'circleclick-internal', 'Design Requests', 'design-requests',
        'Internal command-driven design requests from Slack.', 'slack', true)
on conflict (id) do nothing;

insert into public.work_sources (
  id, client_id, channel_id, source_kind, workspace_ref, source_ref,
  display_name, active, default_client_visible, created_by_user_id,
  slack_notification_mode, slack_activity_notifications_enabled
)
select 'source-slack-design-requests', 'circleclick-internal', 'design-requests', 'slack',
       'T09EZFPHN', 'C0ATZ3A3K0X', 'Slack #design-requests', true, false,
       created_by_user_id, 'never', false
from public.work_sources
where id = 'source-slack-developer-requests'
on conflict (source_kind, workspace_ref, source_ref) do nothing;
