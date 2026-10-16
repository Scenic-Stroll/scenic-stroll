-- Smart routing step 7 (D29): the walking graph export also carries walkers' feedback per edge, as
-- field 23 of each edge tuple (null when there is none). Why in the export and not a separate read:
-- it comes filtered to the trip's box in the same call, and a plain API read stops at 1,000 rows.
-- Older functions ignore the extra field (their tuples accept trailing fields, see graph-export.ts).

-- The export runs with the caller's rights and may be called signed out, so the (anonymous) counts
-- are readable by anon too.
drop policy "signed-in users can read path feedback counts" on public.edge_feedback;
create policy "anyone can read path feedback counts" on public.edge_feedback
  for select to anon, authenticated using (true);
grant select on table public.edge_feedback to anon;

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
  -- Walker feedback per edge: {"shelter": [ups, partly, downs], ...}; edges without any are left out.
  feedback as (
    select f.edge_id, jsonb_object_agg(f.aspect, jsonb_build_array(f.ups, f.partly, f.downs)) as fb
    from public.edge_feedback f, build b
    where f.build_id = b.id and f.edge_id in (select id from edges)
    group by f.edge_id
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
          e.shade_pct,
          fb.fb
        ) order by e.id)
      from edges e left join feedback fb on fb.edge_id = e.id
    ), '[]'::jsonb)
  )
  from build b
$$;
