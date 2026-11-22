-- Knowledge pins, phase 3 (D53): what the admin area needs to write and review pins.

-- The expert's own short summary. The reading versions are generated from it and the sources
-- (generate-pin-versions), and reviewers read it side by side with them.
alter table public.pins
  add column summary text check (char_length(btrim(summary)) between 20 and 2000);
grant insert (summary) on table public.pins to authenticated;
grant update (summary) on table public.pins to authenticated;

-- Which admin-area role the signed-in user has: 'admin', 'expert' or null. Admins who are also
-- experts get 'admin' (they can do both).
create function public.my_pin_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.is_admin() then 'admin'
    when private.is_expert() then 'expert'
    else null
  end
$$;
revoke execute on function public.my_pin_role() from public, anon;
grant execute on function public.my_pin_role() to authenticated;

-- The pedestrian-network node nearest to a point in the active graph, if within p_max_m metres
-- (the expert form snaps a new pin to it; docs/PINS_AUDIT.md §5). Graph data is public, so this
-- runs with the caller's rights.
create function public.nearest_ped_node(p_lat float8, p_lng float8, p_max_m float8 default 25)
returns table (build_id bigint, node_id integer, kind text, level text, lat float8, lng float8, distance_m float8)
language sql
stable
security invoker
set search_path = ''
as $$
  select n.build_id, n.id, n.kind, n.level,
         extensions.st_y(n.geom), extensions.st_x(n.geom),
         extensions.st_distance(n.geom::extensions.geography,
           extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography)
  from public.ped_nodes n
  join public.graph_builds b on b.id = n.build_id and b.status = 'active'
  where extensions.st_dwithin(
    n.geom::extensions.geography,
    extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
    least(p_max_m, 100)
  )
  order by n.geom operator(extensions.<->) extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)
  limit 1
$$;
revoke execute on function public.nearest_ped_node(float8, float8, float8) from public, anon;
grant execute on function public.nearest_ped_node(float8, float8, float8) to authenticated;
