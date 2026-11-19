-- Public web launch, step 4: safety for a public link (DECISIONS D44).
--   1. Rate limits for the Edge Functions (per user and per IP), counted here.
--   2. Shared routes are hidden from others until the team approves them.
--   3. Anyone signed in can report a route; 3 different reporters hide it (status 'flagged').

-- ---------------------------------------------------------------------------
-- 1. Rate limits
-- ---------------------------------------------------------------------------

-- Hits per bucket (e.g. "plan-trip:user:<id>" or "plan-trip:ip:1.2.3.4") per fixed time window.
-- Server-only: no grants to app users; only rate_limit_hit() (run by the Edge Functions) touches it.
create table private.rate_limit_hits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 1,
  primary key (bucket, window_start)
);
alter table private.rate_limit_hits enable row level security;
revoke all on table private.rate_limit_hits from public, anon, authenticated;

-- Counts one request against each bucket. Returns 0 if all are within their limit, otherwise the
-- (1-based) position of the first bucket that is over it — the Edge Function then answers 429.
create function public.rate_limit_hit(p_buckets text[], p_limits integer[], p_window_s integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_s) * p_window_s);
  n integer;
begin
  for i in 1 .. coalesce(array_length(p_buckets, 1), 0) loop
    insert into private.rate_limit_hits as h (bucket, window_start)
    values (p_buckets[i], w)
    on conflict (bucket, window_start) do update set hits = h.hits + 1
    returning h.hits into n;
    if n > p_limits[i] then
      return i;
    end if;
  end loop;
  -- Housekeeping now and then, so the table stays small.
  if random() < 0.01 then
    delete from private.rate_limit_hits where window_start < now() - interval '1 hour';
  end if;
  return 0;
end;
$$;
-- Only the Edge Functions (service role) may call it; app users can't reset or inflate counts.
revoke execute on function public.rate_limit_hit(text[], integer[], integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text[], integer[], integer) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Moderation: hidden until approved
-- ---------------------------------------------------------------------------

alter table public.routes
  add column review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected')),
  add column reviewed_at timestamptz;

-- Anyone may see a route's review status (the app tells authors "waiting for review").
grant select (review_status) on table public.routes to anon, authenticated;

-- Before: every route was readable by everyone. Now: approved, unflagged routes for everyone,
-- and authors always see their own (so My routes and editing keep working).
drop policy "routes are readable by everyone" on public.routes;
create policy "approved routes are readable by everyone; authors see their own"
  on public.routes for select
  to anon, authenticated
  using (
    (review_status = 'approved' and status not in ('flagged', 'retired'))
    or created_by = (select auth.uid())
  );

-- Checkpoints and descriptions follow their route: readable only if the route is.
-- (The subquery runs under the same RLS, so it only finds routes this user may see.)
drop policy "checkpoints are readable by everyone" on public.route_checkpoints;
create policy "checkpoints are readable when their route is"
  on public.route_checkpoints for select
  to anon, authenticated
  using (exists (select 1 from public.routes r where r.id = route_id));

drop policy "descriptions are readable by everyone" on public.route_descriptions;
create policy "descriptions are readable when their route is"
  on public.route_descriptions for select
  to anon, authenticated
  using (exists (select 1 from public.routes r where r.id = route_id));

-- ---------------------------------------------------------------------------
-- 3. Reports
-- ---------------------------------------------------------------------------

create table public.route_reports (
  route_id uuid not null references public.routes (id) on delete cascade,
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason text not null check (reason in ('wrong', 'unsafe', 'closed', 'offensive', 'other')),
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  primary key (route_id, reporter_id) -- one report per person per route
);
create index route_reports_reporter_id_idx on public.route_reports (reporter_id);

alter table public.route_reports enable row level security;
-- Write-only for users: reports aren't readable by anyone in the app (who reported what stays private).
revoke all on table public.route_reports from public, anon, authenticated;
grant insert (route_id, reason, note) on table public.route_reports to authenticated;

create policy "signed-in users report routes they can see, as themselves"
  on public.route_reports for insert
  to authenticated
  with check (
    reporter_id = (select auth.uid())
    and exists (select 1 from public.routes r where r.id = route_id)
  );

-- 3 different people reporting a route hides it until the team looks at it.
create function private.flag_reported_route()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.route_reports where route_id = new.route_id) >= 3 then
    update public.routes set status = 'flagged' where id = new.route_id and status <> 'retired';
  end if;
  return new;
end;
$$;
revoke execute on function private.flag_reported_route() from public, anon, authenticated;

create trigger route_reports_flag
  after insert on public.route_reports
  for each row execute function private.flag_reported_route();
