-- Reconcile the final Work Manager shape for projects that received migrations
-- out of order or stopped before the notification/intake migrations.
alter table public.work_items
  add column if not exists owner_user_id text references public.seo_app_users(id) on delete set null,
  add column if not exists dismissed_at timestamptz,
  add column if not exists dismissed_by_user_id text references public.seo_app_users(id) on delete set null,
  add column if not exists dismissal_reason text,
  add column if not exists dismissal_note text,
  add column if not exists source_snapshot_json jsonb not null default '{}'::jsonb,
  add column if not exists automation_review_needed boolean not null default false,
  add column if not exists automation_last_seen_at timestamptz;

alter table public.work_items drop constraint if exists work_items_dismissal_reason_check;
alter table public.work_items add constraint work_items_dismissal_reason_check
  check (dismissal_reason is null or dismissal_reason in ('not_work', 'no_longer_needed', 'duplicate', 'wrong_client', 'other'));

alter table public.work_item_events drop constraint if exists work_item_events_action_check;
alter table public.work_item_events add constraint work_item_events_action_check
  check (action in ('created', 'updated', 'status_changed', 'evidence_added', 'ingested', 'automation_proposed', 'dismissed', 'restored'));

create index if not exists work_items_client_active_updated
  on public.work_items(client_id, updated_at desc)
  where dismissed_at is null;
create index if not exists work_items_owner_status_updated
  on public.work_items(owner_user_id, status, updated_at desc)
  where owner_user_id is not null;
create index if not exists work_items_automation_review
  on public.work_items(client_id, automation_review_needed, updated_at desc)
  where automation_review_needed = true;
