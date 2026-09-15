create table if not exists public.work_guide_progress (
  user_id text not null references public.seo_app_users(id) on delete cascade,
  guide_id text not null check (char_length(guide_id) between 1 and 80),
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'dismissed', 'completed')),
  current_step smallint not null default 0 check (current_step between 0 and 4),
  completed_at timestamptz,
  dismissed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, guide_id)
);

alter table public.work_guide_progress enable row level security;

revoke all on public.work_guide_progress from anon, authenticated;
grant select, insert, update, delete on public.work_guide_progress to service_role;
