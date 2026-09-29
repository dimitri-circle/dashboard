-- Durable at-most-once ledger for Slack replies that ask a task author for
-- required details before any Work Manager task or workstream is created.
create table if not exists public.work_slack_intake_prompts (
  id uuid primary key,
  source_id text not null references public.work_sources(id) on delete cascade,
  external_id text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'uncertain')),
  slack_ts text,
  error_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (source_id, external_id)
);

alter table public.work_slack_intake_prompts enable row level security;
revoke all on public.work_slack_intake_prompts from anon, authenticated;
grant select, insert, update on public.work_slack_intake_prompts to service_role;
