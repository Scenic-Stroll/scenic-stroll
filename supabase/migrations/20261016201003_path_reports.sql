-- "This path is blocked" reports on the walking graph (smart routing step 6, DECISIONS.md D28).
--
-- A walker taps "Report blocked path ahead"; the app sends a point, the server snaps it to the
-- nearest edge of the active walking graph, and for the next 3 hours:
--   * smart-route treats that edge as impassable (routes go around it), and
--   * everyone following a route gets a Realtime ping, so a route through it is re-planned.
--
-- Privacy: reports are anonymous. Who reported what is kept in private.path_report_authors (only
-- for the rate limit and "clear my reports"); the public table has no user column at all.

create table public.path_reports (
  id bigint generated always as identity primary key,
  build_id bigint not null,
  edge_id integer not null,
  reason text not null default 'blocked' check (reason in ('blocked', 'closed')),
  point extensions.geometry(Point, 4326) not null, -- where it was reported (snapped onto the edge)
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  foreign key (build_id, edge_id) references public.ped_edges (build_id, id) on delete cascade
);
create index path_reports_active_idx on public.path_reports (build_id, expires_at);

-- One row per report action (also re-reports of the same path), so the rate limit counts them all.
create table private.path_report_authors (
  id bigint generated always as identity primary key,
  report_id bigint not null references public.path_reports (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index path_report_authors_report_idx on private.path_report_authors (report_id);
create index path_report_authors_user_idx on private.path_report_authors (user_id, created_at);

alter table public.path_reports enable row level security;
alter table private.path_report_authors enable row level security;

-- Signed-in app users (anonymous accounts count) can read reports that are still active.
-- Nobody writes directly: only through report_blocked_path() below.
create policy "signed-in users can read active path reports" on public.path_reports
  for select to authenticated using (expires_at > now());

revoke all on table public.path_reports from anon, authenticated;
grant select on table public.path_reports to authenticated;
revoke all on table private.path_report_authors from public, anon, authenticated;

/** How long a report counts, and how far from a path a report may be. */
create function private.path_report_settings()
returns table (lifetime interval, max_distance_m float8, max_per_hour integer)
language sql
immutable
set search_path = ''
as $$ select interval '3 hours', 30::float8, 10 $$;
revoke execute on function private.path_report_settings() from public, anon, authenticated;

/**
 * Reports the path nearest (p_lat, p_lng) as blocked. Returns the report (a fresh one, or the
 * existing active report on that edge, extended by another 3 hours).
 */
create function public.report_blocked_path(p_lat float8, p_lng float8, p_reason text default 'blocked')
returns table (id bigint, edge_id integer, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_settings record;
  v_build bigint;
  v_edge integer;
  v_point extensions.geometry;
  v_report bigint;
begin
  if v_user is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  if p_reason not in ('blocked', 'closed') then
    raise exception 'Reason must be blocked or closed' using errcode = '22023';
  end if;
  select * into v_settings from private.path_report_settings();

  -- A small rate limit: one person shouldn't be able to close off the whole area.
  if (
    select count(*) from private.path_report_authors a
    where a.user_id = v_user and a.created_at > now() - interval '1 hour'
  ) >= v_settings.max_per_hour then
    raise exception 'Too many reports — try again later' using errcode = '54000';
  end if;

  select b.id into v_build from public.graph_builds b where b.status = 'active';
  if v_build is null then
    raise exception 'No walking graph loaded' using errcode = 'P0002';
  end if;

  -- The nearest edge within 30 m, and the nearest point on it.
  v_point := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326);
  select e.id, extensions.st_closestpoint(e.geom, v_point)
  into v_edge, v_point
  from public.ped_edges e
  where e.build_id = v_build
    and extensions.st_dwithin(e.geom::extensions.geography, v_point::extensions.geography, v_settings.max_distance_m)
  order by e.geom operator(extensions.<->) v_point
  limit 1;
  if v_edge is null then
    raise exception 'No path within 30 m of that point' using errcode = 'P0002';
  end if;

  -- Already reported and still active? Extend it instead of adding a duplicate.
  update public.path_reports r
  set expires_at = now() + v_settings.lifetime
  where r.build_id = v_build and r.edge_id = v_edge and r.expires_at > now()
  returning r.id into v_report;
  if v_report is null then
    insert into public.path_reports (build_id, edge_id, reason, point, expires_at)
    values (v_build, v_edge, p_reason, v_point, now() + v_settings.lifetime)
    returning path_reports.id into v_report;
  end if;
  insert into private.path_report_authors (report_id, user_id)
  values (v_report, v_user);

  return query select r.id, r.edge_id, r.expires_at from public.path_reports r where r.id = v_report;
end;
$$;

/**
 * Removes the active reports only I made (e.g. "Undo", or after a demo run). Reports someone else
 * confirmed stay. Returns how many were removed.
 */
create function public.clear_my_path_reports()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_count integer;
begin
  if v_user is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  with mine as (
    select a.report_id from private.path_report_authors a
    where a.user_id = v_user
      and not exists (
        select 1 from private.path_report_authors o
        where o.report_id = a.report_id and o.user_id <> v_user
      )
  ), removed as (
    delete from public.path_reports r
    using mine where r.id = mine.report_id and r.expires_at > now()
    returning r.id
  )
  select count(*) into v_count from removed;
  return v_count;
end;
$$;

revoke execute on function
  public.report_blocked_path(float8, float8, text),
  public.clear_my_path_reports()
from public, anon;
grant execute on function
  public.report_blocked_path(float8, float8, text),
  public.clear_my_path_reports()
to authenticated;

-- Realtime: people following a route hear about a new report at once (RLS decides who receives it).
alter publication supabase_realtime add table public.path_reports;
