-- Smart routing step 7 (DECISIONS.md D29): walkers' feedback on computed routes, and saving a
-- walked computed route as a community route.
--
-- Feedback: after a computed walk the app asks one question ("Was it sheltered as promised?"
-- 👍 / Partly / 👎). The answer counts as one vote on each relevant path (edge) of the walk.
--   * private.edge_votes      one vote per person, path and aspect (a later answer replaces it), so
--                             one person can't push a path around alone
--   * public.edge_feedback    the counts per path and aspect, readable by app users; smart-route
--                             turns them into a small cost bonus/penalty, and flips an attribute
--                             (e.g. "covered") once enough people disagree (shared/src/edge-feedback.ts)
--   * private.walk_feedback   one row per answered walk: rate limit and a record of the answers
-- Who voted is never readable through the API.

-- ---------------------------------------------------------------------------
-- Feedback tables
-- ---------------------------------------------------------------------------
create table public.edge_feedback (
  build_id bigint not null,
  edge_id integer not null,
  -- Same list as FEEDBACK_ASPECTS in shared/src/edge-feedback.ts.
  aspect text not null check (aspect in ('shelter', 'shade', 'step_free', 'overall')),
  ups integer not null default 0 check (ups >= 0),
  partly integer not null default 0 check (partly >= 0),
  downs integer not null default 0 check (downs >= 0),
  updated_at timestamptz not null default now(),
  primary key (build_id, edge_id, aspect),
  foreign key (build_id, edge_id) references public.ped_edges (build_id, id) on delete cascade
);

create table private.edge_votes (
  build_id bigint not null,
  edge_id integer not null,
  aspect text not null check (aspect in ('shelter', 'shade', 'step_free', 'overall')),
  user_id uuid not null references auth.users (id) on delete cascade,
  vote smallint not null check (vote in (-1, 0, 1)), -- 👎 / Partly / 👍
  updated_at timestamptz not null default now(),
  primary key (build_id, edge_id, aspect, user_id),
  foreign key (build_id, edge_id) references public.ped_edges (build_id, id) on delete cascade
);

create table private.walk_feedback (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  walk_id uuid not null, -- made on the phone when the walk starts; answering again updates it
  build_id bigint not null,
  profile text not null,
  aspect text not null,
  verdict text not null check (verdict in ('yes', 'partly', 'no')),
  edge_count integer not null,
  -- Demo walks (Diagnostics → Simulate walk) are recorded but never counted as votes.
  simulated boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, walk_id)
);
create index walk_feedback_user_time_idx on private.walk_feedback (user_id, created_at);

alter table public.edge_feedback enable row level security;
alter table private.edge_votes enable row level security;
alter table private.walk_feedback enable row level security;

create policy "signed-in users can read path feedback counts" on public.edge_feedback
  for select to authenticated using (true);

revoke all on table public.edge_feedback from anon, authenticated;
grant select on table public.edge_feedback to authenticated;
revoke all on table private.edge_votes, private.walk_feedback from public, anon, authenticated;

/**
 * Records the answer for one walk. p_edge_ids = the walked route's edges; only the ones the
 * question is about get a vote (shelter: covered/indoor paths; shade: open-air paths; step_free:
 * paths not already known to have steps; overall: all). Returns how many paths got a vote.
 */
create function public.submit_walk_feedback(
  p_walk_id uuid,
  p_build_id bigint,
  p_edge_ids integer[],
  p_profile text,
  p_aspect text,
  p_verdict text,
  p_simulated boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_vote smallint;
  v_edges integer[];
begin
  if v_user is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  if p_aspect not in ('shelter', 'shade', 'step_free', 'overall') then
    raise exception 'Unknown feedback aspect' using errcode = '22023';
  end if;
  if p_verdict not in ('yes', 'partly', 'no') then
    raise exception 'Answer must be yes, partly or no' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_edge_ids), 0) not between 1 and 2000 then
    raise exception 'A walk needs between 1 and 2000 paths' using errcode = '22023';
  end if;
  if not exists (select 1 from public.graph_builds b where b.id = p_build_id and b.status = 'active') then
    raise exception 'That walking map is out of date' using errcode = '22023';
  end if;
  -- 20 answered walks an hour is plenty for a real walker.
  if (
    select count(*) from private.walk_feedback w
    where w.user_id = v_user and w.created_at > now() - interval '1 hour'
      and w.walk_id <> p_walk_id
  ) >= 20 then
    raise exception 'Too many answers — try again later' using errcode = '54000';
  end if;

  -- The paths this question is about.
  select coalesce(array_agg(e.id), '{}') into v_edges
  from public.ped_edges e
  where e.build_id = p_build_id
    and e.id = any (p_edge_ids)
    and case p_aspect
      when 'shelter' then e.covered or e.indoor
      when 'shade' then not e.covered and not e.indoor
      when 'step_free' then e.step_free <> 'no'
      else true
    end;

  insert into private.walk_feedback
    (user_id, walk_id, build_id, profile, aspect, verdict, edge_count, simulated)
  values (v_user, p_walk_id, p_build_id, p_profile, p_aspect, p_verdict, cardinality(v_edges), p_simulated)
  on conflict (user_id, walk_id) do update
    set verdict = excluded.verdict, aspect = excluded.aspect, edge_count = excluded.edge_count;

  if p_simulated or cardinality(v_edges) = 0 then
    return 0;
  end if;

  v_vote := case p_verdict when 'yes' then 1 when 'partly' then 0 else -1 end;
  insert into private.edge_votes (build_id, edge_id, aspect, user_id, vote)
  select p_build_id, unnest(v_edges), p_aspect, v_user, v_vote
  on conflict (build_id, edge_id, aspect, user_id) do update
    set vote = excluded.vote, updated_at = now();

  -- Recount the touched paths from the votes (so a changed answer moves the counts correctly).
  insert into public.edge_feedback (build_id, edge_id, aspect, ups, partly, downs, updated_at)
  select v.build_id, v.edge_id, v.aspect,
         count(*) filter (where v.vote = 1),
         count(*) filter (where v.vote = 0),
         count(*) filter (where v.vote = -1),
         now()
  from private.edge_votes v
  where v.build_id = p_build_id and v.aspect = p_aspect and v.edge_id = any (v_edges)
  group by v.build_id, v.edge_id, v.aspect
  on conflict (build_id, edge_id, aspect) do update
    set ups = excluded.ups, partly = excluded.partly, downs = excluded.downs,
        updated_at = excluded.updated_at;

  return cardinality(v_edges);
end;
$$;

revoke execute on function
  public.submit_walk_feedback(uuid, bigint, integer[], text, text, text, boolean)
from public, anon;
grant execute on function
  public.submit_walk_feedback(uuid, bigint, integer[], text, text, text, boolean)
to authenticated;

-- ---------------------------------------------------------------------------
-- Community routes saved from a walked computed route ("Save as a community route")
-- ---------------------------------------------------------------------------
-- 'recorded' = a walker's GPS recording (Phase 2); 'planned' = a route the app planned and a walker
-- then walked to the end. Both start unverified; the app labels planned ones.
alter table public.routes
  add column origin text not null default 'recorded' check (origin in ('recorded', 'planned'));

-- Same view as before, with `origin` added at the end (a view can only gain columns at the end).
create or replace view public.routes_public
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
  p.display_name as author_name,
  r.origin
from public.routes r
left join public.profiles p on p.id = r.public_author_id
where r.status <> 'retired';

-- Column grants like the other routes columns: everyone may read origin (routes_public runs with
-- the caller's rights), signed-in users may set it when creating a route.
grant select (origin) on table public.routes to anon, authenticated;
grant insert (origin) on table public.routes to authenticated;

-- create_route: as before, plus the optional payload field "origin".
create or replace function public.create_route(payload jsonb)
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
  v_origin text := coalesce(payload ->> 'origin', 'recorded');
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

  insert into public.routes (id, title, start_label, end_label, show_author, duration_s, geom, origin)
  values (
    v_id,
    btrim(payload ->> 'title'),
    nullif(btrim(payload ->> 'start_label'), ''),
    nullif(btrim(payload ->> 'end_label'), ''),
    coalesce((payload ->> 'show_author')::boolean, false),
    (payload ->> 'duration_s')::integer,
    v_geom,
    v_origin
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
