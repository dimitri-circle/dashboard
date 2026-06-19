create table if not exists public.seo_clients (
  id text primary key,
  name text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.seo_integrations (
  id text primary key,
  user_id text not null references public.seo_clients(id) on delete cascade,
  provider text not null check (provider in ('ga4', 'gtm', 'hotjar', 'openai', 'mcp', 'gsc', 'semrush', 'ahrefs')),
  display_name text not null,
  status text not null check (status in ('disconnected', 'connected', 'error')),
  config_json jsonb not null default '{}'::jsonb,
  encrypted_secret jsonb,
  last_tested_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.seo_insights (
  id text primary key,
  user_id text not null references public.seo_clients(id) on delete cascade,
  title text not null,
  description text not null,
  impact text not null,
  recommendation text not null,
  priority text not null check (priority in ('low', 'medium', 'high')),
  confidence_score double precision not null,
  source_provider text not null,
  source_payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.seo_metric_snapshots (
  id text primary key,
  user_id text not null references public.seo_clients(id) on delete cascade,
  provider text not null check (provider in ('ga4', 'gtm', 'hotjar', 'openai', 'mcp', 'gsc', 'semrush', 'ahrefs')),
  page_url text,
  metric_name text not null,
  metric_value double precision not null,
  dimensions_json jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.seo_competitive_analyses (
  id text primary key,
  user_id text not null references public.seo_clients(id) on delete cascade,
  client_name text not null,
  website_url text,
  industry text not null,
  market text,
  target_audience text,
  competitors jsonb not null default '[]'::jsonb,
  target_keywords jsonb not null default '[]'::jsonb,
  summary text not null,
  positioning text not null,
  competitor_themes jsonb not null default '[]'::jsonb,
  content_gaps jsonb not null default '[]'::jsonb,
  keyword_opportunities jsonb not null default '[]'::jsonb,
  missing_from_client jsonb not null default '[]'::jsonb,
  competitor_only_patterns jsonb not null default '[]'::jsonb,
  shared_patterns jsonb not null default '[]'::jsonb,
  client_strengths jsonb not null default '[]'::jsonb,
  crawl_evidence jsonb not null default '[]'::jsonb,
  top_performers jsonb not null default '[]'::jsonb,
  report_draft jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  assumptions jsonb not null default '[]'::jsonb,
  confidence_score double precision not null,
  source_payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.seo_audit_events (
  id text primary key,
  user_id text not null,
  action text not null,
  entity_type text not null check (entity_type in ('client', 'integration', 'insight', 'sync', 'system')),
  entity_id text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.seo_app_users (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  password_salt text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists seo_clients_name on public.seo_clients(name);
create index if not exists seo_integrations_client_provider on public.seo_integrations(user_id, provider);
create index if not exists seo_integrations_client_status on public.seo_integrations(user_id, status);
create index if not exists seo_insights_client_created on public.seo_insights(user_id, created_at desc);
create index if not exists seo_metric_snapshots_client_provider_captured
  on public.seo_metric_snapshots(user_id, provider, captured_at desc);
create index if not exists seo_metric_snapshots_client_metric_captured
  on public.seo_metric_snapshots(user_id, metric_name, captured_at desc);
create index if not exists seo_competitive_analyses_client_created
  on public.seo_competitive_analyses(user_id, created_at desc);
create index if not exists seo_audit_events_client_created on public.seo_audit_events(user_id, created_at desc);
create index if not exists seo_audit_events_action_created on public.seo_audit_events(action, created_at desc);

alter table public.seo_clients enable row level security;
alter table public.seo_integrations enable row level security;
alter table public.seo_insights enable row level security;
alter table public.seo_metric_snapshots enable row level security;
alter table public.seo_competitive_analyses enable row level security;
alter table public.seo_audit_events enable row level security;
alter table public.seo_app_users enable row level security;
