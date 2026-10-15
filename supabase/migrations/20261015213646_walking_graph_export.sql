-- The active walking graph in ONE compact JSON value, for the smart-route Edge Function, which keeps
-- it in memory and routes in TypeScript (DECISIONS.md D25).
-- Why one value: PostgREST returns at most 1,000 rows per request, and ~10,000 edges as arrays
-- (not objects) with encoded-polyline lines are ~2.5 MB (~0.6 MB gzipped) — one request, not eleven.
-- The field order is the contract with shared/src/graph-export.ts: add new fields at the END only.
--
-- Open data, so anyone may call it (it only reads tables that are already public).
create function public.walking_graph_export()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
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
      from public.ped_nodes n where n.build_id = b.id
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
      from public.ped_edges e where e.build_id = b.id
    ), '[]'::jsonb)
  )
  from public.graph_builds b
  where b.status = 'active'
$$;

revoke execute on function public.walking_graph_export() from public;
grant execute on function public.walking_graph_export() to anon, authenticated;
