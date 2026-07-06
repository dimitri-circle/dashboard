alter table public.seo_clients
  add column if not exists feature_flags_json jsonb not null default '{
    "brain": true,
    "overview": false,
    "watch": false,
    "integrations": false,
    "analysis": false,
    "insights": false
  }'::jsonb;

update public.seo_clients
set feature_flags_json = '{
  "brain": true,
  "overview": false,
  "watch": false,
  "integrations": false,
  "analysis": false,
  "insights": false
}'::jsonb
where feature_flags_json = '{}'::jsonb;
