create table if not exists public.seo_brain_contexts (
  id text primary key,
  user_id text not null references public.seo_clients(id) on delete cascade,
  context_text text not null default '',
  approved_sources_json jsonb not null default '[]'::jsonb,
  forbidden_claims_json jsonb not null default '[]'::jsonb,
  tone_rules_json jsonb not null default '[]'::jsonb,
  tone_profile_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.seo_brain_reports (
  id text primary key,
  user_id text not null references public.seo_clients(id) on delete cascade,
  source_label text not null,
  status text not null check (status in ('needs_edits', 'ready_for_editor', 'approved', 'rejected', 'archived')),
  recommendation text not null check (recommendation in ('PASS', 'PASS_WITH_EDITS', 'DO_NOT_PUBLISH')),
  truth_score double precision not null,
  brand_score double precision not null,
  claim_count integer not null default 0,
  report_json jsonb not null default '{}'::jsonb,
  draft_excerpt text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists seo_brain_contexts_client_updated
  on public.seo_brain_contexts(user_id, updated_at desc);
create index if not exists seo_brain_reports_client_created
  on public.seo_brain_reports(user_id, created_at desc);
create index if not exists seo_brain_reports_client_status_created
  on public.seo_brain_reports(user_id, status, created_at desc);

alter table public.seo_brain_contexts enable row level security;
alter table public.seo_brain_reports enable row level security;

revoke all on table public.seo_brain_contexts from anon, authenticated;
revoke all on table public.seo_brain_reports from anon, authenticated;
grant select, insert, update, delete on table public.seo_brain_contexts to service_role;
grant select, insert, update, delete on table public.seo_brain_reports to service_role;
