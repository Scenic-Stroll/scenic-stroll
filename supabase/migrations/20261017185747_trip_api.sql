-- Multimodal step 1 (DECISIONS.md D31): cost control for paid routing APIs (Google Routes).
--
--   * api_cache  identical requests (rounded start/end, mode, 5-minute time bucket) reuse the
--                answer for a few minutes, so planning the same trip twice costs one call
--   * api_calls  one row per paid call, so plan-trip can stop at a daily cap and we can see usage
--
-- Server only, like conditions_cache: RLS on, no policies and no grants, so app users can't read
-- or write either table; the Edge Function uses the service role.

create table public.api_cache (
  key text primary key,
  payload jsonb not null,
  expires_at timestamptz not null
);
create index api_cache_expires_idx on public.api_cache (expires_at);

create table public.api_calls (
  id bigint generated always as identity primary key,
  api text not null, -- e.g. 'google_routes_drive'
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index api_calls_api_time_idx on public.api_calls (api, created_at);

alter table public.api_cache enable row level security;
alter table public.api_calls enable row level security;
revoke all on table public.api_cache, public.api_calls from anon, authenticated;
