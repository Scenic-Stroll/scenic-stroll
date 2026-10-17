-- Smart routing step 8 (D30): "Shade now" leaves out merged lines shorter than 10 m.
-- Measured on the live graph (13:00): 3,137 lines → 1,931, with 93 % of the length kept.
create or replace function public.shade_layer(
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
  ),
  -- Scraps under 10 m are ~40 % of the lines but < 7 % of the length (measured on the live graph):
  -- leaving them out keeps the map smooth and changes nothing you can see.
  visible as (
    select cls, geom from merged
    where extensions.st_length(geom::extensions.geography) >= 10
  )
  select jsonb_build_object(
    'date', b.shade_date,
    'first_min', b.shade_first_min,
    'bucket_min', b.shade_bucket_min,
    -- [class, encoded polyline (precision 5)]
    'lines', coalesce(
      (select jsonb_agg(jsonb_build_array(m.cls, extensions.st_asencodedpolyline(m.geom, 5))) from visible m),
      '[]'::jsonb
    )
  )
  from build b
$$;
