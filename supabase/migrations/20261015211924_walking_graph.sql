-- Our own walking graph (smart routing step 2): nodes and edges built from the Lands Department
-- 3D Pedestrian Network by scripts/graph/ (see docs/SETUP.md → "Walking graph", DECISIONS.md D24).
--
-- Who can do what:
--   * Everyone (signed in or not) may READ it: it is open government data.
--   * Nobody can write the tables directly. The loader script writes through three functions that
--     demand a loader key. Only the key's SHA-256 hash is stored, and keys expire (1 day), so a key
--     that leaks from a laptop stops working by itself.
--   * One build is 'active' at a time; loading a new build never disturbs the active one until the
--     final graph_activate() swaps them.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.graph_builds (
  id bigint generated always as identity primary key,
  source text not null check (source in ('lands_3dpn', 'osm')),
  -- e.g. the download date of the source data; shown as "Map data updated …" in Diagnostics
  source_version text not null,
  bbox extensions.geometry(Polygon, 4326) not null,
  status text not null default 'loading' check (status in ('loading', 'active', 'retired')),
  node_count integer not null default 0,
  edge_count integer not null default 0,
  -- connectivity etc. from the build script, for the record
  report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  activated_at timestamptz
);
-- At most one active build.
create unique index graph_builds_one_active on public.graph_builds ((true)) where status = 'active';

create table public.ped_nodes (
  build_id bigint not null references public.graph_builds (id) on delete cascade,
  id integer not null, -- numbered by the build script, unique within a build
  geom extensions.geometry(Point, 4326) not null,
  z_m real not null, -- height in metres (Hong Kong Principal Datum)
  level text,
  kind text not null check (
    kind in ('street', 'lift', 'escalator', 'stairs_top', 'stairs_bottom', 'mrt_exit', 'building_entrance')
  ),
  is_entrance boolean not null default false,
  primary key (build_id, id)
);
create index ped_nodes_geom_idx on public.ped_nodes using gist (geom);

create table public.ped_edges (
  build_id bigint not null references public.graph_builds (id) on delete cascade,
  id integer not null,
  source integer not null,
  target integer not null,
  geom extensions.geometry(LineString, 4326) not null, -- drawn source → target
  length_m real not null check (length_m >= 0),
  kind text not null check (
    kind in (
      'footway', 'crossing', 'footbridge', 'subway', 'indoor_corridor', 'mall',
      'lift', 'escalator', 'stairs', 'ramp'
    )
  ),
  covered boolean not null,
  indoor boolean not null,
  air_conditioned boolean not null, -- estimated (indoor ⇒ air-conditioned), see D24
  step_free text not null check (step_free in ('yes', 'no', 'unknown')),
  slope_pct real not null default 0,
  z_from real,
  z_to real,
  level_from text,
  level_to text,
  crossing_wait_s smallint not null default 0 check (crossing_wait_s >= 0),
  opening_hours text, -- OSM style, e.g. 'Mo-Su 07:00-24:00'; null = always open
  tree_cover_pct real check (tree_cover_pct between 0 and 100), -- filled in step 4
  data_source text not null check (data_source in ('lands_3dpn', 'osm', 'community', 'manual')),
  confidence real not null check (confidence between 0 and 1),
  bidirectional boolean not null, -- false = only source → target (e.g. an up escalator)
  name_en text,
  name_zh text,
  source_ref text, -- 3DPN PedestrianRouteID, to trace an edge back to the source data
  primary key (build_id, id),
  foreign key (build_id, source) references public.ped_nodes (build_id, id) on delete cascade,
  foreign key (build_id, target) references public.ped_nodes (build_id, id) on delete cascade
);
create index ped_edges_geom_idx on public.ped_edges using gist (geom);
create index ped_edges_source_idx on public.ped_edges (build_id, source);
create index ped_edges_target_idx on public.ped_edges (build_id, target);

-- ---------------------------------------------------------------------------
-- Read access: open data, everyone may read; nobody writes directly.
-- ---------------------------------------------------------------------------
alter table public.graph_builds enable row level security;
alter table public.ped_nodes enable row level security;
alter table public.ped_edges enable row level security;

create policy "anyone can read graph builds" on public.graph_builds
  for select to anon, authenticated using (true);
create policy "anyone can read walking graph nodes" on public.ped_nodes
  for select to anon, authenticated using (true);
create policy "anyone can read walking graph edges" on public.ped_edges
  for select to anon, authenticated using (true);

revoke all on table public.graph_builds, public.ped_nodes, public.ped_edges from anon, authenticated;
grant select on table public.graph_builds, public.ped_nodes, public.ped_edges to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Loader keys (hash only) and the loader functions
-- ---------------------------------------------------------------------------
create table private.graph_loader_keys (
  key_hash bytea primary key, -- sha256 of the key; the key itself is never stored
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
revoke all on table private.graph_loader_keys from public, anon, authenticated;

create function private.require_loader_key(p_key text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_key is null or not exists (
    select 1 from private.graph_loader_keys k
    where k.key_hash = sha256(convert_to(p_key, 'UTF8')) and k.expires_at > now()
  ) then
    raise exception 'Invalid or expired graph loader key' using errcode = '28000';
  end if;
end;
$$;

/** Starts a new build (status 'loading') and returns its id. */
create function private.graph_begin(p_key text, p_source text, p_source_version text, p_bbox jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform private.require_loader_key(p_key);
  insert into public.graph_builds (source, source_version, bbox)
  values (
    p_source,
    p_source_version,
    extensions.st_makeenvelope(
      (p_bbox ->> 'minLng')::float8, (p_bbox ->> 'minLat')::float8,
      (p_bbox ->> 'maxLng')::float8, (p_bbox ->> 'maxLat')::float8, 4326
    )
  )
  returning id into v_id;
  return v_id;
end;
$$;

/**
 * Adds a batch of nodes and edges to a build that is still loading. Nodes must arrive before the
 * edges that use them (the loader sends all nodes first).
 * p_nodes: [{id, lng, lat, z, level, kind, is_entrance}]
 * p_edges: [{id, source, target, coords: [[lng,lat],…], length_m, kind, …}]
 */
create function private.graph_add(p_key text, p_build_id bigint, p_nodes jsonb, p_edges jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nodes integer;
  v_edges integer;
begin
  perform private.require_loader_key(p_key);
  if not exists (select 1 from public.graph_builds where id = p_build_id and status = 'loading') then
    raise exception 'Build % is not loading', p_build_id;
  end if;

  insert into public.ped_nodes (build_id, id, geom, z_m, level, kind, is_entrance)
  select p_build_id, n.id, extensions.st_setsrid(extensions.st_makepoint(n.lng, n.lat), 4326),
         n.z, n.level, n.kind, n.is_entrance
  from jsonb_to_recordset(coalesce(p_nodes, '[]'::jsonb)) as n(
    id integer, lng float8, lat float8, z real, level text, kind text, is_entrance boolean
  );
  get diagnostics v_nodes = row_count;

  insert into public.ped_edges (
    build_id, id, source, target, geom, length_m, kind, covered, indoor, air_conditioned, step_free,
    slope_pct, z_from, z_to, level_from, level_to, crossing_wait_s, opening_hours, tree_cover_pct,
    data_source, confidence, bidirectional, name_en, name_zh, source_ref
  )
  select p_build_id, e.id, e.source, e.target,
         extensions.st_setsrid(
           extensions.st_geomfromgeojson(jsonb_build_object('type', 'LineString', 'coordinates', e.coords)::text),
           4326
         ),
         e.length_m, e.kind, e.covered, e.indoor, e.air_conditioned, e.step_free, e.slope_pct,
         e.z_from, e.z_to, e.level_from, e.level_to, e.crossing_wait_s, e.opening_hours,
         e.tree_cover_pct, e.data_source, e.confidence, e.bidirectional, e.name_en, e.name_zh,
         e.source_ref
  from jsonb_to_recordset(coalesce(p_edges, '[]'::jsonb)) as e(
    id integer, source integer, target integer, coords jsonb, length_m real, kind text,
    covered boolean, indoor boolean, air_conditioned boolean, step_free text, slope_pct real,
    z_from real, z_to real, level_from text, level_to text, crossing_wait_s smallint,
    opening_hours text, tree_cover_pct real, data_source text, confidence real,
    bidirectional boolean, name_en text, name_zh text, source_ref text
  );
  get diagnostics v_edges = row_count;

  return v_nodes + v_edges;
end;
$$;

/**
 * Makes a fully loaded build the active one: checks it isn't empty, retires the previous active
 * build and deletes the retired builds' nodes/edges (their build rows stay, as history).
 */
create function private.graph_activate(p_key text, p_build_id bigint, p_report jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nodes integer;
  v_edges integer;
begin
  perform private.require_loader_key(p_key);
  if not exists (select 1 from public.graph_builds where id = p_build_id and status = 'loading') then
    raise exception 'Build % is not loading', p_build_id;
  end if;
  select count(*) into v_nodes from public.ped_nodes where build_id = p_build_id;
  select count(*) into v_edges from public.ped_edges where build_id = p_build_id;
  if v_nodes = 0 or v_edges = 0 then
    raise exception 'Build % is empty — not activating it', p_build_id;
  end if;

  update public.graph_builds set status = 'retired' where status = 'active';
  update public.graph_builds
  set status = 'active', activated_at = now(), node_count = v_nodes, edge_count = v_edges,
      report = coalesce(p_report, '{}'::jsonb)
  where id = p_build_id;

  delete from public.ped_edges where build_id in (select id from public.graph_builds where status <> 'active');
  delete from public.ped_nodes where build_id in (select id from public.graph_builds where status <> 'active');

  return jsonb_build_object('build_id', p_build_id, 'nodes', v_nodes, 'edges', v_edges);
end;
$$;

revoke execute on function
  private.require_loader_key(text),
  private.graph_begin(text, text, text, jsonb),
  private.graph_add(text, bigint, jsonb, jsonb),
  private.graph_activate(text, bigint, jsonb)
from public, anon;
grant execute on function
  private.require_loader_key(text),
  private.graph_begin(text, text, text, jsonb),
  private.graph_add(text, bigint, jsonb, jsonb),
  private.graph_activate(text, bigint, jsonb)
to authenticated;

-- Public API for the loader script (SECURITY INVOKER wrappers; the key check happens inside).
create function public.graph_begin(p_key text, p_source text, p_source_version text, p_bbox jsonb)
returns bigint
language sql security invoker set search_path = ''
as $$ select private.graph_begin(p_key, p_source, p_source_version, p_bbox) $$;

create function public.graph_add(p_key text, p_build_id bigint, p_nodes jsonb, p_edges jsonb)
returns integer
language sql security invoker set search_path = ''
as $$ select private.graph_add(p_key, p_build_id, p_nodes, p_edges) $$;

create function public.graph_activate(p_key text, p_build_id bigint, p_report jsonb)
returns jsonb
language sql security invoker set search_path = ''
as $$ select private.graph_activate(p_key, p_build_id, p_report) $$;

revoke execute on function
  public.graph_begin(text, text, text, jsonb),
  public.graph_add(text, bigint, jsonb, jsonb),
  public.graph_activate(text, bigint, jsonb)
from public, anon;
grant execute on function
  public.graph_begin(text, text, text, jsonb),
  public.graph_add(text, bigint, jsonb, jsonb),
  public.graph_activate(text, bigint, jsonb)
to authenticated;
