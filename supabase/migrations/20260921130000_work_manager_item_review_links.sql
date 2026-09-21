alter table public.work_review_links
  add column if not exists item_id text references public.work_items(id) on delete cascade;

create index if not exists work_review_links_item_active
  on public.work_review_links(item_id, created_at desc)
  where revoked_at is null and item_id is not null;
