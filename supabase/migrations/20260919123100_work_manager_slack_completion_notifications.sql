alter table public.work_sources
  add column if not exists slack_notification_mode text not null default 'never',
  add column if not exists slack_notification_thread_ts text;

alter table public.work_sources drop constraint if exists work_sources_slack_notification_mode_check;
alter table public.work_sources add constraint work_sources_slack_notification_mode_check
  check (slack_notification_mode in ('never', 'completed', 'completed_and_blocked'));

alter table public.work_item_events drop constraint if exists work_item_events_action_check;
alter table public.work_item_events add constraint work_item_events_action_check
  check (action in ('created', 'updated', 'status_changed', 'evidence_added', 'ingested', 'automation_proposed', 'dismissed', 'restored', 'routed'));

create table if not exists public.work_slack_notification_deliveries (
  id uuid primary key,
  source_id text not null references public.work_sources(id) on delete cascade,
  item_id uuid not null references public.work_items(id) on delete cascade,
  event_id uuid not null references public.work_item_events(id) on delete cascade,
  kind text not null check (kind in ('completed', 'blocked')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  slack_ts text,
  error_text text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (event_id)
);

alter table public.work_slack_notification_deliveries enable row level security;
revoke all on public.work_slack_notification_deliveries from anon, authenticated;
grant select, insert, update, delete on public.work_slack_notification_deliveries to service_role;
