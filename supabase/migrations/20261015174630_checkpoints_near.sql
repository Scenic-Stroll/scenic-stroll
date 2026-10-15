-- Redesign step 7: floor selector. Community checkpoints (lifts, escalators, entrances… with their
-- floors) near a building. Checkpoints are already publicly readable; this only makes the spatial
-- query easy and returns plain lat/lng. SECURITY INVOKER, so RLS still applies.
-- Routes that are flagged (3+ reports) or retired are left out.

create function public.checkpoints_near(p_lat float8, p_lng float8, p_radius_m float8 default 150)
returns table (
  id bigint,
  route_id uuid,
  kind public.checkpoint_kind,
  floor_from text,
  floor_to text,
  note text,
  lat float8,
  lng float8
)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id, c.route_id, c.kind, c.floor_from, c.floor_to, c.note,
         extensions.st_y(c.point), extensions.st_x(c.point)
  from public.route_checkpoints c
  join public.routes r on r.id = c.route_id
  where r.status not in ('flagged', 'retired')
    and extensions.st_dwithin(
      c.point::extensions.geography,
      extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
      least(greatest(p_radius_m, 1), 500) -- capped at 500 m
    )
  limit 300;
$$;

revoke execute on function public.checkpoints_near(float8, float8, float8) from public;
grant execute on function public.checkpoints_near(float8, float8, float8) to anon, authenticated;
