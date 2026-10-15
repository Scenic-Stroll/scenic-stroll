-- walking_graph_export can now return just the part of the graph a trip needs (a box around its start
-- and end + a margin), using the GiST index on ped_edges.geom.
-- Why: hosted Edge Functions start a fresh worker for almost every request, so keeping the whole graph
-- in memory doesn't help; loading ~3,000 nearby edges per request is what keeps smart-route fast.
-- With no box (all nulls) it still returns the whole active graph, as before.
-- The field order is the contract with shared/src/graph-export.ts: add new fields at the END only.
drop function public.walking_graph_export();

create function public.walking_graph_export(
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
    select id, source, source_version from public.graph_builds where status = 'active'
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
          e.data_source, e.level_from, e.level_to
        ) order by e.id)
      from edges e
    ), '[]'::jsonb)
  )
  from build b
$$;

revoke execute on function public.walking_graph_export(float8, float8, float8, float8) from public;
grant execute on function public.walking_graph_export(float8, float8, float8, float8)
  to anon, authenticated;
