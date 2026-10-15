-- Cache of Hong Kong Observatory open-data answers for the `conditions` Edge Function.
-- Why: HKO updates hourly, so we fetch at most every 5–10 min, and if HKO is down we can still
-- serve the last good answer (marked "stale") instead of nothing.
--
-- Only the Edge Function (service role) reads and writes this table. App users never touch it:
-- RLS is on with NO policies for anon/authenticated, and they get no GRANTs either.
create table public.conditions_cache (
  feed text primary key check (feed in ('rhrread', 'warnsum')),
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.conditions_cache enable row level security;

revoke all on table public.conditions_cache from anon, authenticated;
grant select, insert, update on table public.conditions_cache to service_role;

comment on table public.conditions_cache is
  'Last HKO weather answers (feed = HKO dataType). Written by the conditions Edge Function only.';
