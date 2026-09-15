alter table public.work_items
  add column if not exists dismissed_at timestamptz,
  add column if not exists dismissed_by_user_id text references public.seo_app_users(id) on delete set null,
  add column if not exists dismissal_reason text,
  add column if not exists dismissal_note text;

alter table public.work_items drop constraint if exists work_items_dismissal_reason_check;
alter table public.work_items add constraint work_items_dismissal_reason_check
  check (dismissal_reason is null or dismissal_reason in ('not_work', 'no_longer_needed', 'duplicate', 'wrong_client', 'other'));

alter table public.work_item_events drop constraint if exists work_item_events_action_check;
alter table public.work_item_events add constraint work_item_events_action_check
  check (action in ('created', 'updated', 'status_changed', 'evidence_added', 'ingested', 'automation_proposed', 'dismissed', 'restored'));

create index if not exists work_items_client_active_updated
  on public.work_items(client_id, updated_at desc)
  where dismissed_at is null;
