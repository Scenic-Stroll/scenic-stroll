-- Phase 2: routes recorded by users, their checkpoints (lifts, stairs, floors…) and descriptions.
--
-- Privacy model (build prompt §3 "never expose created_by when show_author = false"):
--   * `routes.created_by` and `route_descriptions.author_id` get NO select grant, so asking for
--     them through the API fails with "permission denied".
--   * `routes.public_author_id` is filled by a trigger only when the author chose "show my name".
--   * Policies on a table may read that table's hidden column (owner can edit/delete), but a policy
--     on ANOTHER table cannot. Checkpoint ownership therefore goes through private.owns_route().
--     Both facts were verified on Postgres 17 before writing this migration (see DECISIONS.md D11).
--
-- Uploads go through public.create_route(payload) so a route, its checkpoints and its first
-- description are saved in ONE transaction (all or nothing), and retries are safe (id from the phone).

-- ---------------------------------------------------------------------------
-- Types (must match shared/src/schemas.ts)
-- ---------------------------------------------------------------------------
create type public.route_status as enum ('unverified', 'verified', 'flagged', 'retired');
create type public.checkpoint_kind as enum (
  'lift', 'escalator', 'stairs', 'entrance', 'footbridge', 'underpass', 'note'
);
create type public.detected_lang as enum ('en', 'zh-HK', 'mixed');

-- ---------------------------------------------------------------------------
-- routes
-- ---------------------------------------------------------------------------
create table public.routes (
  id uuid primary key, -- generated on the phone, so a retried upload can't create a duplicate
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  show_author boolean not null default false,
  public_author_id uuid references auth.users (id) on delete cascade, -- set by trigger
  title text not null check (char_length(title) between 1 and 80),
  geom extensions.geometry(LineString, 4326) not null
    check (extensions.st_npoints(geom) between 2 and 5000),
  start_point extensions.geometry(Point, 4326) not null, -- set by trigger
  end_point extensions.geometry(Point, 4326) not null, -- set by trigger
  start_label text check (char_length(start_label) between 1 and 80),
  end_label text check (char_length(end_label) between 1 and 80),
  distance_m real not null check (distance_m >= 0), -- set by trigger (never trust the phone)
  duration_s integer not null check (duration_s between 0 and 21600),
  status public.route_status not null default 'unverified',
  verified_at timestamptz,
  last_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.routes is
  'Community walking routes. created_by is hidden from the API; see public_author_id.';

create index routes_geom_idx on public.routes using gist (geom);
-- "Routes starting/ending within 150 m" queries use geography (metres), so index that expression.
create index routes_start_geog_idx on public.routes using gist ((start_point::extensions.geography));
create index routes_end_geog_idx on public.routes using gist ((end_point::extensions.geography));
create index routes_created_by_idx on public.routes (created_by);

-- Derived columns are computed here, not sent by the phone.
create function private.routes_fill_derived()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.start_point := extensions.st_startpoint(new.geom);
  new.end_point := extensions.st_endpoint(new.geom);
  new.distance_m := extensions.st_length(new.geom::extensions.geography);
  new.public_author_id := case when new.show_author then new.created_by end;
  return new;
end;
$$;
revoke execute on function private.routes_fill_derived() from public, anon, authenticated;

create trigger routes_fill_derived
  before insert or update on public.routes
  for each row execute function private.routes_fill_derived();

-- Rate limit: at most 60 new routes per user per hour (used by the insert policy).
create function private.under_route_limit()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) < 60
  from public.routes
  where created_by = (select auth.uid())
    and created_at > now() - interval '1 hour';
$$;
revoke execute on function private.under_route_limit() from public, anon;
grant execute on function private.under_route_limit() to authenticated;

-- Answers only "does the CURRENT user own route X?" — never reveals who does.
create function private.owns_route(p_route_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.routes
    where id = p_route_id and created_by = (select auth.uid())
  );
$$;
revoke execute on function private.owns_route(uuid) from public, anon;
grant execute on function private.owns_route(uuid) to authenticated;

alter table public.routes enable row level security;

revoke all on table public.routes from anon, authenticated;
grant select (
  id, show_author, public_author_id, title, geom, start_point, end_point, start_label, end_label,
  distance_m, duration_s, status, verified_at, last_confirmed_at, created_at
) on table public.routes to anon, authenticated; -- NOT created_by
grant insert (id, show_author, title, geom, start_label, end_label, duration_s)
  on table public.routes to authenticated;
grant update (title, start_label, end_label, show_author) on table public.routes to authenticated;
grant delete on table public.routes to authenticated;

create policy "routes are readable by everyone"
  on public.routes for select
  to anon, authenticated
  using (true);

create policy "users create their own routes, within the rate limit"
  on public.routes for insert
  to authenticated
  with check ((select auth.uid()) = created_by and (select private.under_route_limit()));

create policy "users update their own routes"
  on public.routes for update
  to authenticated
  using ((select auth.uid()) = created_by)
  with check ((select auth.uid()) = created_by);

create policy "users delete their own routes"
  on public.routes for delete
  to authenticated
  using ((select auth.uid()) = created_by);

-- ---------------------------------------------------------------------------
-- route_checkpoints — how floor levels get captured (GPS is poor indoors)
-- ---------------------------------------------------------------------------
create table public.route_checkpoints (
  id bigint generated always as identity primary key,
  route_id uuid not null references public.routes (id) on delete cascade,
  seq integer not null check (seq >= 1),
  point extensions.geometry(Point, 4326) not null,
  kind public.checkpoint_kind not null,
  floor_from text check (char_length(floor_from) between 1 and 10),
  floor_to text check (char_length(floor_to) between 1 and 10),
  note text check (char_length(note) between 1 and 200),
  unique (route_id, seq)
);

create index route_checkpoints_point_idx on public.route_checkpoints using gist (point);

alter table public.route_checkpoints enable row level security;

revoke all on table public.route_checkpoints from anon, authenticated;
grant select on table public.route_checkpoints to anon, authenticated;
grant insert (route_id, seq, point, kind, floor_from, floor_to, note)
  on table public.route_checkpoints to authenticated;
grant update (kind, floor_from, floor_to, note) on table public.route_checkpoints to authenticated;
grant delete on table public.route_checkpoints to authenticated;

create policy "checkpoints are readable by everyone"
  on public.route_checkpoints for select
  to anon, authenticated
  using (true);

create policy "route owners add checkpoints"
  on public.route_checkpoints for insert
  to authenticated
  with check ((select private.owns_route(route_id)));

create policy "route owners update checkpoints"
  on public.route_checkpoints for update
  to authenticated
  using ((select private.owns_route(route_id)))
  with check ((select private.owns_route(route_id)));

create policy "route owners delete checkpoints"
  on public.route_checkpoints for delete
  to authenticated
  using ((select private.owns_route(route_id)));

-- ---------------------------------------------------------------------------
-- route_descriptions — anyone signed in can describe any route (many per route)
-- ---------------------------------------------------------------------------
create table public.route_descriptions (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes (id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 2000),
  detected_lang public.detected_lang, -- filled in by AI tagging (Phase 3)
  created_at timestamptz not null default now()
);

create index route_descriptions_route_id_idx on public.route_descriptions (route_id);
create index route_descriptions_author_id_idx on public.route_descriptions (author_id);

alter table public.route_descriptions enable row level security;

revoke all on table public.route_descriptions from anon, authenticated;
grant select (id, route_id, text, detected_lang, created_at)
  on table public.route_descriptions to anon, authenticated; -- NOT author_id
grant insert (id, route_id, text) on table public.route_descriptions to authenticated;
grant update (text) on table public.route_descriptions to authenticated;
grant delete on table public.route_descriptions to authenticated;

create policy "descriptions are readable by everyone"
  on public.route_descriptions for select
  to anon, authenticated
  using (true);

create policy "users add descriptions as themselves"
  on public.route_descriptions for insert
  to authenticated
  with check ((select auth.uid()) = author_id);

create policy "users update their own descriptions"
  on public.route_descriptions for update
  to authenticated
  using ((select auth.uid()) = author_id)
  with check ((select auth.uid()) = author_id);

create policy "users delete their own descriptions"
  on public.route_descriptions for delete
  to authenticated
  using ((select auth.uid()) = author_id);

-- ---------------------------------------------------------------------------
-- routes_public — what the app reads when showing community routes (Phase 4)
-- security_invoker: runs with the caller's rights, so RLS and the hidden columns still apply.
-- ---------------------------------------------------------------------------
create view public.routes_public
with (security_invoker = true)
as
select
  r.id,
  r.title,
  r.start_label,
  r.end_label,
  r.distance_m,
  r.duration_s,
  r.status,
  r.verified_at,
  r.last_confirmed_at,
  r.created_at,
  extensions.st_asgeojson(r.geom)::jsonb as geojson,
  r.public_author_id as author_id,
  p.display_name as author_name
from public.routes r
left join public.profiles p on p.id = r.public_author_id
where r.status <> 'retired';

grant select on public.routes_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_route(payload) — called by the app's upload queue.
-- Payload shape = RouteUploadSchema in shared/src/route-upload.ts.
-- SECURITY INVOKER: runs as the caller, so every policy above still applies.
-- ---------------------------------------------------------------------------
create function public.create_route(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := (payload ->> 'id')::uuid;
  v_line jsonb := payload -> 'line';
  v_checkpoints jsonb := coalesce(payload -> 'checkpoints', '[]'::jsonb);
  v_description text := nullif(btrim(payload ->> 'description'), '');
  v_geom extensions.geometry;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in before uploading a route' using errcode = '28000';
  end if;
  if v_id is null then
    raise exception 'Route id is missing' using errcode = '22023';
  end if;

  -- Already uploaded (the phone retried after a timeout) → nothing to do.
  if exists (select 1 from public.routes where id = v_id) then
    return v_id;
  end if;

  if jsonb_typeof(v_line) is distinct from 'array'
     or jsonb_array_length(v_line) not between 2 and 5000 then
    raise exception 'A route needs between 2 and 5000 points' using errcode = '22023';
  end if;
  if jsonb_typeof(v_checkpoints) <> 'array' or jsonb_array_length(v_checkpoints) > 100 then
    raise exception 'At most 100 checkpoints per route' using errcode = '22023';
  end if;
  -- Hong Kong only (same box as HK_BOUNDS in shared/src/api.ts).
  if exists (
    select 1 from jsonb_array_elements(v_line) as p
    where (p ->> 'lat')::float8 not between 22.1 and 22.6
       or (p ->> 'lng')::float8 not between 113.8 and 114.5
  ) then
    raise exception 'Route must be in Hong Kong' using errcode = '22023';
  end if;

  select extensions.st_setsrid(
           extensions.st_makeline(
             array_agg(
               extensions.st_makepoint((p ->> 'lng')::float8, (p ->> 'lat')::float8)
               order by i
             )
           ),
           4326
         )
    into v_geom
    from jsonb_array_elements(v_line) with ordinality as e(p, i);

  insert into public.routes (id, title, start_label, end_label, show_author, duration_s, geom)
  values (
    v_id,
    btrim(payload ->> 'title'),
    nullif(btrim(payload ->> 'start_label'), ''),
    nullif(btrim(payload ->> 'end_label'), ''),
    coalesce((payload ->> 'show_author')::boolean, false),
    (payload ->> 'duration_s')::integer,
    v_geom
  );

  insert into public.route_checkpoints (route_id, seq, point, kind, floor_from, floor_to, note)
  select
    v_id,
    (c ->> 'seq')::integer,
    extensions.st_setsrid(
      extensions.st_makepoint((c -> 'point' ->> 'lng')::float8, (c -> 'point' ->> 'lat')::float8),
      4326
    ),
    (c ->> 'kind')::public.checkpoint_kind,
    nullif(btrim(c ->> 'floor_from'), ''),
    nullif(btrim(c ->> 'floor_to'), ''),
    nullif(btrim(c ->> 'note'), '')
  from jsonb_array_elements(v_checkpoints) as c;

  if v_description is not null then
    insert into public.route_descriptions (route_id, text) values (v_id, v_description);
  end if;

  return v_id;
end;
$$;

revoke execute on function public.create_route(jsonb) from public, anon;
grant execute on function public.create_route(jsonb) to authenticated;
