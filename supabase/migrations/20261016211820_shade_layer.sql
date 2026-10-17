-- Smart routing step 8 (D30): the "Shade now" map layer.
--
-- Returns the walking paths in a box, classed by estimated shade at one half-hour bucket
-- (sun / part / shade, plus covered walkways), with neighbouring paths of the same class merged
-- into long lines. Why merged on the server: the map draws one native line per path, and a few
-- thousand separate ones make it stutter; merged it's a few hundred.
-- Indoor paths and lifts are left out (no sky to see). Read-only open data, like the graph itself.
create function public.shade_layer(
  p_bucket integer,
  p_min_lng float8,
  p_min_lat float8,
  p_max_lng float8,
  p_max_lat float8
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with build as (
    select id, shade_date, shade_first_min, shade_bucket_min
    from public.graph_builds where status = 'active'
  ),
  classed as (
    select
      e.geom,
      case
        when e.covered then 'covered'
        when e.shade_pct is null or e.shade_pct[p_bucket + 1] is null then null -- unknown: not drawn
        when e.shade_pct[p_bucket + 1] >= 70 then 'shade'
        when e.shade_pct[p_bucket + 1] >= 35 then 'part'
        else 'sun'
      end as cls
    from public.ped_edges e, build b
    where e.build_id = b.id
      and not e.indoor
      and e.kind <> 'lift'
      and e.geom operator(extensions.&&)
          extensions.st_makeenvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326)
  ),
  merged as (
    select cls, (extensions.st_dump(extensions.st_linemerge(extensions.st_collect(geom)))).geom as geom
    from classed
    where cls is not null
    group by cls
  )
  select jsonb_build_object(
    'date', b.shade_date,
    'first_min', b.shade_first_min,
    'bucket_min', b.shade_bucket_min,
    -- [class, encoded polyline (precision 5)]
    'lines', coalesce(
      (select jsonb_agg(jsonb_build_array(m.cls, extensions.st_asencodedpolyline(m.geom, 5))) from merged m),
      '[]'::jsonb
    )
  )
  from build b
$$;

revoke execute on function public.shade_layer(integer, float8, float8, float8, float8) from public;
grant execute on function public.shade_layer(integer, float8, float8, float8, float8)
  to anon, authenticated;
