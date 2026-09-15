create table if not exists public.work_channels (
  id text primary key,
  client_id text not null references public.seo_clients(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$' or slug ~ '^[a-z0-9]$'),
  description text,
  source_kind text not null default 'manual' check (source_kind in ('manual', 'slack', 'google_meet')),
  external_ref text,
  active boolean not null default true,
  created_by_user_id text references public.seo_app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, slug)
);

create table if not exists public.work_items (
  id text primary key,
  client_id text not null references public.seo_clients(id) on delete cascade,
  channel_id text not null references public.work_channels(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  now_text text not null default '',
  next_text text not null default '',
  blocker_text text,
  owner_name text,
  status text not null default 'new' check (status in ('new', 'in_progress', 'blocked', 'done', 'needs_evidence', 'unknown')),
  due_date date,
  source_kind text not null default 'manual' check (source_kind in ('manual', 'slack', 'google_meet')),
  source_url text,
  source_external_id text,
  completion_evidence_url text,
  client_visible boolean not null default true,
  created_by_user_id text references public.seo_app_users(id) on delete set null,
  updated_by_user_id text references public.seo_app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check (status <> 'done' or completion_evidence_url is not null),
  check (status <> 'blocked' or nullif(btrim(blocker_text), '') is not null)
);

create table if not exists public.work_item_events (
  id text primary key,
  client_id text not null references public.seo_clients(id) on delete cascade,
  item_id text not null references public.work_items(id) on delete cascade,
  actor_user_id text references public.seo_app_users(id) on delete set null,
  action text not null check (action in ('created', 'updated', 'status_changed', 'evidence_added')),
  before_json jsonb not null default '{}'::jsonb,
  after_json jsonb not null default '{}'::jsonb,
  source_evidence_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.work_review_links (
  id text primary key,
  client_id text not null references public.seo_clients(id) on delete cascade,
  channel_id text references public.work_channels(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by_user_id text references public.seo_app_users(id) on delete set null,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists work_items_source_identity
  on public.work_items(client_id, source_kind, source_external_id)
  where source_external_id is not null;
create index if not exists work_channels_client_active
  on public.work_channels(client_id, active, name);
create index if not exists work_items_channel_status_updated
  on public.work_items(client_id, channel_id, status, updated_at desc);
create index if not exists work_items_client_due
  on public.work_items(client_id, due_date)
  where due_date is not null and status <> 'done';
create index if not exists work_item_events_item_created
  on public.work_item_events(item_id, created_at desc);
create index if not exists work_review_links_client_active
  on public.work_review_links(client_id, created_at desc)
  where revoked_at is null;

alter table public.work_channels enable row level security;
alter table public.work_items enable row level security;
alter table public.work_item_events enable row level security;
alter table public.work_review_links enable row level security;

revoke all on public.work_channels from anon, authenticated;
revoke all on public.work_items from anon, authenticated;
revoke all on public.work_item_events from anon, authenticated;
revoke all on public.work_review_links from anon, authenticated;

grant select, insert, update, delete on public.work_channels to service_role;
grant select, insert, update, delete on public.work_items to service_role;
grant select, insert on public.work_item_events to service_role;
grant select, insert, update on public.work_review_links to service_role;
