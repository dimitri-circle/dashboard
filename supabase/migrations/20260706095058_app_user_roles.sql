alter table public.seo_app_users
  add column if not exists role text,
  add column if not exists last_login_at timestamptz,
  add column if not exists disabled_at timestamptz;

update public.seo_app_users
set role = 'admin'
where role is null;

alter table public.seo_app_users
  alter column role set default 'operator',
  alter column role set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'seo_app_users_role_check'
      and conrelid = 'public.seo_app_users'::regclass
  ) then
    alter table public.seo_app_users
      add constraint seo_app_users_role_check
      check (role in ('admin', 'operator', 'viewer'));
  end if;
end $$;

create index if not exists seo_app_users_role on public.seo_app_users(role);
create index if not exists seo_app_users_disabled on public.seo_app_users(disabled_at);

alter table public.seo_app_users enable row level security;
grant select, insert, update on public.seo_app_users to service_role;
