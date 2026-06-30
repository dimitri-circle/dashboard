create table if not exists public.seo_watch_baselines (
  id text primary key,
  user_id text not null references public.seo_clients(id) on delete cascade,
  site_url text not null,
  site_origin text not null,
  baseline_json jsonb not null,
  page_count integer not null default 0,
  captured_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, site_url)
);

create table if not exists public.seo_change_runs (
  id text primary key,
  user_id text not null references public.seo_clients(id) on delete cascade,
  baseline_id text references public.seo_watch_baselines(id) on delete set null,
  site_url text not null,
  site_origin text not null,
  status text not null check (status in ('baseline', 'unchanged', 'changed', 'failed')),
  summary_json jsonb not null default '{}'::jsonb,
  changes_json jsonb not null default '[]'::jsonb,
  pages_json jsonb not null default '[]'::jsonb,
  previous_captured_at timestamptz,
  checked_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists seo_watch_baselines_client_site
  on public.seo_watch_baselines(user_id, site_url);
create index if not exists seo_watch_baselines_client_updated
  on public.seo_watch_baselines(user_id, updated_at desc);
create index if not exists seo_change_runs_client_site_checked
  on public.seo_change_runs(user_id, site_url, checked_at desc);
create index if not exists seo_change_runs_client_created
  on public.seo_change_runs(user_id, created_at desc);

alter table public.seo_watch_baselines enable row level security;
alter table public.seo_change_runs enable row level security;
