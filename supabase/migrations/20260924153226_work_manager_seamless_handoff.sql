-- Preserve the client/workstream invariant even when a future writer bypasses
-- the application service. Stop with an actionable error rather than silently
-- changing existing production work.
do $$
begin
  if exists (
    select 1 from public.work_items i
    left join public.work_channels c on c.id = i.channel_id and c.client_id = i.client_id
    where c.id is null
  ) then
    raise exception 'Work Manager migration stopped: work_items contains client/workstream mismatches; reconcile those rows before applying this migration.';
  end if;
end $$;

alter table public.work_items
  add constraint work_items_client_id_id_key unique (client_id, id);

alter table public.work_items
  add constraint work_items_client_channel_fkey
  foreign key (client_id, channel_id)
  references public.work_channels(client_id, id)
  on delete cascade;

alter table public.work_item_events drop constraint if exists work_item_events_action_check;
alter table public.work_item_events add constraint work_item_events_action_check
  check (action in ('created', 'updated', 'status_changed', 'evidence_added', 'ingested', 'automation_proposed', 'dismissed', 'restored', 'routed', 'commented'));

alter table public.work_sources
  add column if not exists slack_activity_notifications_enabled boolean not null default false;

create table if not exists public.work_item_comments (
  id text primary key,
  client_id text not null references public.seo_clients(id) on delete cascade,
  item_id text not null references public.work_items(id) on delete cascade,
  author_user_id text references public.seo_app_users(id) on delete set null,
  author_name text not null check (char_length(author_name) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 3000),
  client_visible boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (client_id, item_id) references public.work_items(client_id, id) on update cascade on delete cascade
);

create index if not exists work_item_comments_item_created
  on public.work_item_comments(item_id, created_at);

alter table public.work_item_comments enable row level security;
revoke all on public.work_item_comments from anon, authenticated;
grant select, insert, update, delete on public.work_item_comments to service_role;

alter table public.work_slack_notification_deliveries
  drop constraint if exists work_slack_notification_deliveries_kind_check,
  drop constraint if exists work_slack_notification_deliveries_status_check;
alter table public.work_slack_notification_deliveries
  add constraint work_slack_notification_deliveries_kind_check check (kind in ('intake', 'activity', 'completed', 'blocked')),
  add constraint work_slack_notification_deliveries_status_check check (status in ('pending', 'sent', 'failed', 'uncertain')),
  add column if not exists attempt_count integer not null default 1,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists work_slack_notification_deliveries_item_created
  on public.work_slack_notification_deliveries(item_id, created_at desc);
