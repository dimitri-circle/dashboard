create table if not exists public.seo_visitor_events (
  id text primary key,
  user_id text not null references public.seo_clients(id) on delete cascade,
  site_origin text not null,
  event_type text not null check (event_type in ('request', 'pageview')),
  source text not null check (source in ('edge', 'server', 'browser', 'manual')),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  page_url text not null,
  path text not null,
  method text,
  status_code integer,
  referrer text,
  user_agent text,
  visitor_ip_hash text,
  visitor_ip_prefix text,
  country text,
  asn text,
  bot_name text,
  bot_category text not null check (bot_category in ('human', 'search', 'ai', 'seo', 'monitoring', 'scanner', 'automation', 'unknown')),
  bot_verification text not null check (bot_verification in ('verified', 'self_declared', 'failed', 'unknown', 'not_applicable')),
  automation_score integer not null check (automation_score >= 0 and automation_score <= 100),
  classification_reasons jsonb not null default '[]'::jsonb,
  request_headers_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb
);

create index if not exists seo_visitor_events_client_received
  on public.seo_visitor_events(user_id, received_at desc);
create index if not exists seo_visitor_events_client_site_received
  on public.seo_visitor_events(user_id, site_origin, received_at desc);
create index if not exists seo_visitor_events_client_bot_received
  on public.seo_visitor_events(user_id, bot_category, received_at desc);
create index if not exists seo_visitor_events_client_page_received
  on public.seo_visitor_events(user_id, path, received_at desc);

alter table public.seo_visitor_events enable row level security;

grant select, insert on public.seo_visitor_events to service_role;
