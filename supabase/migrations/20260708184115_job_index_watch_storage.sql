create table if not exists public.seo_job_index_snapshots (
  id text primary key,
  user_id text not null references public.seo_clients(id) on delete cascade,
  source_url text not null,
  source_origin text not null,
  snapshot_json jsonb not null,
  role_count integer not null default 0,
  captured_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_url)
);

create table if not exists public.seo_job_index_runs (
  id text primary key,
  user_id text not null references public.seo_clients(id) on delete cascade,
  snapshot_id text references public.seo_job_index_snapshots(id) on delete set null,
  source_url text not null,
  source_origin text not null,
  status text not null check (status in ('baseline', 'unchanged', 'changed', 'failed')),
  summary_json jsonb not null default '{}'::jsonb,
  changes_json jsonb not null default '[]'::jsonb,
  roles_json jsonb not null default '[]'::jsonb,
  previous_captured_at timestamptz,
  checked_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists seo_job_index_snapshots_client_source
  on public.seo_job_index_snapshots(user_id, source_url);
create index if not exists seo_job_index_snapshots_client_updated
  on public.seo_job_index_snapshots(user_id, updated_at desc);
create index if not exists seo_job_index_runs_client_source_checked
  on public.seo_job_index_runs(user_id, source_url, checked_at desc);
create index if not exists seo_job_index_runs_client_created
  on public.seo_job_index_runs(user_id, created_at desc);

alter table public.seo_job_index_snapshots enable row level security;
alter table public.seo_job_index_runs enable row level security;

grant select, insert, update, delete on public.seo_job_index_snapshots to service_role;
grant select, insert, update, delete on public.seo_job_index_runs to service_role;
