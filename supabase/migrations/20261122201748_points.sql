-- Knowledge pins, phase 5 (D55): points from recorded walks and pin reading, written only by the
-- award-points Edge Function (service role); the rules live in shared/src/pointsRules.ts.

-- When the new rules started. Points earned under the old rules (+10 per route, +5 per
-- description) before this moment stay as "earlier points"; nothing is awarded under them after.
create function private.points_cutoff()
returns timestamptz
language sql
immutable
set search_path = ''
as $$ select '2026-11-24 00:00:00+08'::timestamptz $$;

-- Distance walked per walk and Hong Kong day, after the GPS filter and the speed check. Only these
-- numbers are kept — not the GPS track. Readable by the walker (the daily ring); written by the server.
create table public.walk_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  walk_id uuid not null,
  day date not null,
  counted_m numeric(10, 1) not null check (counted_m >= 0),
  too_fast_m numeric(10, 1) not null default 0 check (too_fast_m >= 0),
  created_at timestamptz not null default now(),
  primary key (user_id, walk_id, day)
);
create index walk_days_user_day_idx on public.walk_days (user_id, day);
alter table public.walk_days enable row level security;
revoke all on table public.walk_days from public, anon, authenticated;
grant select on table public.walk_days to authenticated;
grant select, insert on table public.walk_days to service_role;
create policy "users read their own walk distances"
  on public.walk_days for select to authenticated using (user_id = (select auth.uid()));

-- When a reader opened a collected pin, timed by the server: pin-read points need ≥ 10 s.
create table public.pin_read_sessions (
  user_id uuid not null references auth.users (id) on delete cascade,
  pin_id uuid not null references public.pins (id) on delete cascade,
  opened_at timestamptz not null default now(),
  primary key (user_id, pin_id)
);
alter table public.pin_read_sessions enable row level security;
revoke all on table public.pin_read_sessions from public, anon, authenticated;
grant select on table public.pin_read_sessions to service_role;

-- The server writes points and read state (the client never can).
grant select, insert on table public.points_ledger to service_role;
grant select, update on table public.collection_entries to service_role;
grant select on table public.user_settings to service_role;

-- The reader opened: start (or restart) its timer. Adults with the pin in their collection only.
create function public.start_pin_read(p_pin uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or private.in_safety_mode() then
    return; -- under-18s read on the device only; nothing to time
  end if;
  if not exists (select 1 from public.collection_entries where user_id = v_uid and pin_id = p_pin) then
    return;
  end if;
  insert into public.pin_read_sessions (user_id, pin_id, opened_at)
  values (v_uid, p_pin, now())
  on conflict (user_id, pin_id) do update set opened_at = now();
end;
$$;
revoke execute on function public.start_pin_read(uuid) from public, anon;
grant execute on function public.start_pin_read(uuid) to authenticated;

-- Old-rule points (routes and descriptions) from before the cutoff, kept for history.
create function private.legacy_points(p_user uuid, p_since timestamptz)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (
    (select count(*) from public.routes
      where created_by = p_user and created_at >= p_since and created_at < private.points_cutoff()) * 10 +
    (select count(*) from public.route_descriptions
      where author_id = p_user and created_at >= p_since and created_at < private.points_cutoff()) * 5
  )::integer
$$;

-- The Friends leaderboard and profiles: earlier (old-rule) points + points in the ledger.
create or replace function private.points_since(p_user uuid, p_since timestamptz)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select private.legacy_points(p_user, p_since) + coalesce((
    select sum(amount) from public.points_ledger where user_id = p_user and created_at >= p_since
  ), 0)::integer
$$;

-- Profile: balance, today's points and today's walked metres (for the ring), earlier points.
create function public.my_points_summary()
returns table (balance integer, today_points integer, today_meters numeric, earlier_points integer)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as uid),
  today as (select (now() at time zone 'Asia/Hong_Kong')::date as d)
  select
    coalesce((select sum(amount) from public.points_ledger l, me where l.user_id = me.uid), 0)::integer,
    coalesce((select sum(amount) from public.points_ledger l, me, today
              where l.user_id = me.uid and l.occurred_on = today.d), 0)::integer,
    coalesce((select sum(counted_m) from public.walk_days w, me, today
              where w.user_id = me.uid and w.day = today.d), 0),
    (select private.legacy_points(me.uid, '-infinity') from me)
$$;
revoke execute on function public.my_points_summary() from public, anon;
grant execute on function public.my_points_summary() to authenticated;
