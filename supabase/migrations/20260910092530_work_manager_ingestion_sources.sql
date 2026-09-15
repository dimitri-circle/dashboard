alter table public.work_channels
  add constraint work_channels_client_id_id_key unique (client_id, id);

create table if not exists public.work_sources (
  id text primary key,
  client_id text not null,
  channel_id text not null,
  source_kind text not null check (source_kind in ('slack', 'google_meet')),
  workspace_ref text not null default '' check (char_length(workspace_ref) <= 220),
  source_ref text not null check (char_length(source_ref) between 1 and 220),
  display_name text not null check (char_length(display_name) between 1 and 120),
  active boolean not null default true,
  default_client_visible boolean not null default false,
  last_ingested_at timestamptz,
  created_by_user_id text references public.seo_app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (client_id, channel_id)
    references public.work_channels(client_id, id)
    on delete cascade,
  unique (source_kind, workspace_ref, source_ref)
);

alter table public.work_items
  add column if not exists source_snapshot_json jsonb not null default '{}'::jsonb,
  add column if not exists automation_review_needed boolean not null default false,
  add column if not exists automation_last_seen_at timestamptz;

alter table public.work_item_events
  drop constraint if exists work_item_events_action_check;

alter table public.work_item_events
  add constraint work_item_events_action_check
  check (action in ('created', 'updated', 'status_changed', 'evidence_added', 'ingested', 'automation_proposed'));

create index if not exists work_sources_client_channel_active
  on public.work_sources(client_id, channel_id, active);

create index if not exists work_items_automation_review
  on public.work_items(client_id, automation_review_needed, updated_at desc)
  where automation_review_needed = true;

alter table public.work_sources enable row level security;

revoke all on public.work_sources from anon, authenticated;
grant select, insert, update, delete on public.work_sources to service_role;
