alter table public.work_items
  add column if not exists owner_user_id text references public.seo_app_users(id) on delete set null;

create index if not exists work_items_owner_status_updated
  on public.work_items(owner_user_id, status, updated_at desc)
  where owner_user_id is not null;

create table if not exists public.work_notification_preferences (
  user_id text primary key references public.seo_app_users(id) on delete cascade,
  email_enabled boolean not null default false,
  digest_hour smallint not null default 17 check (digest_hour between 0 and 23),
  timezone text not null default 'America/Chicago' check (char_length(timezone) between 1 and 80),
  assigned_enabled boolean not null default true,
  blocked_enabled boolean not null default true,
  review_enabled boolean not null default true,
  due_enabled boolean not null default true,
  channel_intake_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.work_notification_subscriptions (
  id text primary key,
  user_id text not null references public.seo_app_users(id) on delete cascade,
  client_id text not null references public.seo_clients(id) on delete cascade,
  channel_id text references public.work_channels(id) on delete cascade,
  item_id text references public.work_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((channel_id is not null)::int + (item_id is not null)::int = 1)
);

create unique index if not exists work_notification_subscriptions_channel
  on public.work_notification_subscriptions(user_id, channel_id)
  where channel_id is not null;
create unique index if not exists work_notification_subscriptions_item
  on public.work_notification_subscriptions(user_id, item_id)
  where item_id is not null;

create table if not exists public.work_notifications (
  id text primary key,
  recipient_user_id text not null references public.seo_app_users(id) on delete cascade,
  client_id text not null references public.seo_clients(id) on delete cascade,
  channel_id text not null references public.work_channels(id) on delete cascade,
  item_id text not null references public.work_items(id) on delete cascade,
  event_id text references public.work_item_events(id) on delete set null,
  kind text not null check (kind in ('assigned', 'blocked', 'review_needed', 'watched_changed', 'due_soon', 'overdue', 'channel_intake')),
  title text not null check (char_length(title) between 1 and 180),
  message text not null check (char_length(message) between 1 and 500),
  dedupe_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_user_id, dedupe_key)
);

create index if not exists work_notifications_recipient_unread
  on public.work_notifications(recipient_user_id, read_at, created_at desc);
create index if not exists work_notifications_client_item
  on public.work_notifications(client_id, item_id, created_at desc);

create table if not exists public.work_notification_deliveries (
  id text primary key,
  notification_id text not null references public.work_notifications(id) on delete cascade,
  recipient_user_id text not null references public.seo_app_users(id) on delete cascade,
  channel text not null check (channel in ('email')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'suppressed')),
  digest_date date not null,
  attempted_at timestamptz,
  sent_at timestamptz,
  error_text text,
  created_at timestamptz not null default now(),
  unique (notification_id, channel)
);

alter table public.work_notification_preferences enable row level security;
alter table public.work_notification_subscriptions enable row level security;
alter table public.work_notifications enable row level security;
alter table public.work_notification_deliveries enable row level security;

revoke all on public.work_notification_preferences from anon, authenticated;
revoke all on public.work_notification_subscriptions from anon, authenticated;
revoke all on public.work_notifications from anon, authenticated;
revoke all on public.work_notification_deliveries from anon, authenticated;

grant select, insert, update, delete on public.work_notification_preferences to service_role;
grant select, insert, update, delete on public.work_notification_subscriptions to service_role;
grant select, insert, update, delete on public.work_notifications to service_role;
grant select, insert, update on public.work_notification_deliveries to service_role;
