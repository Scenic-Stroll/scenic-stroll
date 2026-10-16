-- Shade for the walking graph (smart routing step 4).
-- Each edge gets 25 numbers: % shaded at 07:00, 07:30, … 19:00 Hong Kong time on one day
-- (building shadows from Lands Department heights + OpenStreetMap trees), computed on a laptop by
-- scripts/graph/compute-shade.mts and uploaded with the same one-day loader key as the graph.
-- Stored as an array on the edge rather than a row per edge per half hour (~270,000 rows): one
-- day's shade is reused for ~2 weeks (DECISIONS.md D26), and the router reads all 25 at once.

alter table public.ped_edges
  add column shade_pct smallint[] check (shade_pct is null or array_length(shade_pct, 1) between 1 and 48);

alter table public.graph_builds
  add column shade_date date, -- the day the shade was computed for
  add column shade_first_min smallint, -- minutes after midnight of the first value (420 = 07:00)
  add column shade_bucket_min smallint; -- minutes between values (30)

/**
 * Sets shade for a batch of edges of a build: p_rows = [[edge_id, [pct, …], tree_cover_pct], …].
 * Works on the active build (shade can be refreshed any day without rebuilding the graph).
 */
create function private.graph_set_shade(
  p_key text,
  p_build_id bigint,
  p_date date,
  p_first_min smallint,
  p_bucket_min smallint,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform private.require_loader_key(p_key);
  if not exists (
    select 1 from public.graph_builds where id = p_build_id and status in ('loading', 'active')
  ) then
    raise exception 'Build % is not loading or active', p_build_id;
  end if;

  update public.ped_edges e
  set shade_pct = array(select jsonb_array_elements_text(r.value -> 1)::smallint),
      tree_cover_pct = (r.value ->> 2)::real
  from jsonb_array_elements(p_rows) as r(value)
  where e.build_id = p_build_id and e.id = (r.value ->> 0)::integer;
  get diagnostics v_count = row_count;

  update public.graph_builds
  set shade_date = p_date, shade_first_min = p_first_min, shade_bucket_min = p_bucket_min
  where id = p_build_id;

  return v_count;
end;
$$;

revoke execute on function private.graph_set_shade(text, bigint, date, smallint, smallint, jsonb)
  from public, anon;
grant execute on function private.graph_set_shade(text, bigint, date, smallint, smallint, jsonb)
  to authenticated;

create function public.graph_set_shade(
  p_key text,
  p_build_id bigint,
  p_date date,
  p_first_min smallint,
  p_bucket_min smallint,
  p_rows jsonb
)
returns integer
language sql security invoker set search_path = ''
as $$ select private.graph_set_shade(p_key, p_build_id, p_date, p_first_min, p_bucket_min, p_rows) $$;

revoke execute on function public.graph_set_shade(text, bigint, date, smallint, smallint, jsonb)
  from public, anon;
grant execute on function public.graph_set_shade(text, bigint, date, smallint, smallint, jsonb)
  to authenticated;

-- The export gains field 22 (shade_pct, or null) and a top-level "shade" object.
create or replace function public.walking_graph_export(
  p_min_lng float8 default null,
  p_min_lat float8 default null,
  p_max_lng float8 default null,
  p_max_lat float8 default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with build as (
    select id, source, source_version, shade_date, shade_first_min, shade_bucket_min
    from public.graph_builds where status = 'active'
  ),
  area as (
    select case
      when p_min_lng is null or p_min_lat is null or p_max_lng is null or p_max_lat is null then null
      else extensions.st_makeenvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326)
    end as box
  ),
  edges as (
    select e.*
    from public.ped_edges e, build b, area a
    where e.build_id = b.id and (a.box is null or e.geom operator(extensions.&&) a.box)
  ),
  nodes as (
    select n.*
    from public.ped_nodes n, build b
    where n.build_id = b.id
      and n.id in (select source from edges union select target from edges)
  )
  select jsonb_build_object(
    'build_id', b.id,
    'source', b.source,
    'version', b.source_version,
    'shade', case when b.shade_date is null then null else jsonb_build_object(
      'date', b.shade_date, 'first_min', b.shade_first_min, 'bucket_min', b.shade_bucket_min
    ) end,
    'nodes', coalesce((
      select jsonb_agg(
        jsonb_build_array(
          n.id,
          round(extensions.st_x(n.geom)::numeric, 7),
          round(extensions.st_y(n.geom)::numeric, 7),
          n.z_m,
          n.kind
        ) order by n.id)
      from nodes n
    ), '[]'::jsonb),
    'edges', coalesce((
      select jsonb_agg(
        jsonb_build_array(
          e.id, e.source, e.target, e.length_m, e.kind, e.covered, e.indoor, e.air_conditioned,
          e.step_free, e.slope_pct, e.z_from, e.z_to, e.crossing_wait_s, e.opening_hours,
          e.confidence, e.bidirectional, e.name_en, e.name_zh,
          extensions.st_asencodedpolyline(e.geom, 6),
          e.data_source, e.level_from, e.level_to,
          e.shade_pct
        ) order by e.id)
      from edges e
    ), '[]'::jsonb)
  )
  from build b
$$;
