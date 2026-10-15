-- Redesign step 5: friends — codes, requests, accept/decline/remove/block, activity, weekly leaderboard.
--
-- Privacy model:
--   * friendships rows are visible only to the two people in them (and a block only to the blocker).
--   * Nobody can insert/update/delete friendships directly. All changes go through functions that
--     check auth.uid(); the privileged logic is SECURITY DEFINER in the non-exposed `private` schema,
--     wrapped by thin SECURITY INVOKER functions in `public` (the only ones the API can call).
--   * Friend activity only shows routes whose author turned on "show my name" (public_author_id).
--   * Profiles/leaderboard of others are only returned for ACCEPTED friends.
-- Live location sharing is a separate migration (step 6).

-- Future functions in `private` must not be callable by everyone by default.
alter default privileges in schema private revoke execute on functions from public;
-- The public wrappers call private.* by name, which needs USAGE on the schema. Every function in
-- `private` has EXECUTE revoked from public/anon unless explicitly granted, so this exposes nothing new.
grant usage on schema private to authenticated;

create type public.friendship_status as enum ('pending', 'accepted', 'blocked');

-- ---------------------------------------------------------------------------
-- friend_codes — one short shareable code per user, e.g. STROLL-7K2Q
-- ---------------------------------------------------------------------------
create table public.friend_codes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- No I, O, 0 or 1: easy to read aloud and type.
  code text not null unique check (code ~ '^STROLL-[A-HJ-NP-Z2-9]{4}$'),
  created_at timestamptz not null default now()
);

alter table public.friend_codes enable row level security;
revoke all on table public.friend_codes from anon, authenticated;
grant select on table public.friend_codes to authenticated;

create policy "users see their own friend code"
  on public.friend_codes for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- friendships
-- ---------------------------------------------------------------------------
create table public.friendships (
  id bigint generated always as identity primary key,
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status public.friendship_status not null default 'pending',
  blocked_by uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id),
  check ((status = 'blocked') = (blocked_by is not null))
);

-- One row per pair, whichever direction it was created in.
create unique index friendships_pair_idx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee_idx on public.friendships (addressee_id);
create index friendships_blocked_by_idx on public.friendships (blocked_by);

alter table public.friendships enable row level security;
revoke all on table public.friendships from anon, authenticated;
grant select on table public.friendships to authenticated;

create policy "users see their own friendships (blocks only to the blocker)"
  on public.friendships for select
  to authenticated
  using (
    (select auth.uid()) in (requester_id, addressee_id)
    and (status <> 'blocked' or blocked_by = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- Helpers (private, not callable through the API)
-- ---------------------------------------------------------------------------
create function private.require_uid()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  return v_uid;
end;
$$;

/** The other person's id in a friendship row. */
create function private.other_party(f public.friendships, me uuid)
returns uuid
language sql
immutable
set search_path = ''
as $$ select case when f.requester_id = me then f.addressee_id else f.requester_id end $$;

/** "Karim" — or "Walker 7K2Q" for people without a display name. */
create function private.public_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select display_name from public.profiles where id = p_user),
    'Walker ' || coalesce(
      (select right(code, 4) from public.friend_codes where user_id = p_user), '????')
  );
$$;

/** Points as defined in shared/src/levels.ts: +10 per route, +5 per description (since p_since). */
create function private.points_since(p_user uuid, p_since timestamptz)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (
    (select count(*) from public.routes where created_by = p_user and created_at >= p_since) * 10 +
    (select count(*) from public.route_descriptions where author_id = p_user and created_at >= p_since) * 5
  )::integer;
$$;

create function private.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and least(requester_id, addressee_id) = least(a, b)
      and greatest(requester_id, addressee_id) = greatest(a, b)
  );
$$;

-- ---------------------------------------------------------------------------
-- Privileged actions (private, SECURITY DEFINER, each checks the caller)
-- ---------------------------------------------------------------------------

/** Returns my friend code, creating one on first use. */
create function private.my_friend_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  select code into v_code from public.friend_codes where user_id = v_uid;
  if v_code is not null then
    return v_code;
  end if;
  for attempt in 1..10 loop
    v_code := 'STROLL-' || (
      select string_agg(substr(v_alphabet, 1 + floor(random() * 32)::int, 1), '')
      from generate_series(1, 4)
    );
    begin
      insert into public.friend_codes (user_id, code) values (v_uid, v_code);
      return v_code;
    exception when unique_violation then
      -- Another user has this code (or we raced ourselves): try again.
      select code into v_code from public.friend_codes where user_id = v_uid;
      if v_code is not null then
        return v_code;
      end if;
    end;
  end loop;
  raise exception 'Could not create a friend code, try again' using errcode = 'P0001';
end;
$$;

/**
 * Sends a friend request to the owner of p_code. If they already asked me, this accepts it.
 * Returns 'requested' | 'accepted' | 'already_friends' | 'already_requested'.
 * Blocked pairs get a generic error so the sender can't tell they were blocked.
 */
create function private.send_friend_request(p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_other uuid;
  v_row public.friendships;
begin
  select user_id into v_other from public.friend_codes where code = upper(btrim(p_code));
  if v_other is null then
    raise exception 'No walker has that code' using errcode = 'P0002';
  end if;
  if v_other = v_uid then
    raise exception 'That’s your own code' using errcode = '22023';
  end if;

  select * into v_row from public.friendships
  where least(requester_id, addressee_id) = least(v_uid, v_other)
    and greatest(requester_id, addressee_id) = greatest(v_uid, v_other)
  for update;

  if found then
    if v_row.status = 'blocked' then
      raise exception 'Can’t send a request to this walker' using errcode = '42501';
    elsif v_row.status = 'accepted' then
      return 'already_friends';
    elsif v_row.addressee_id = v_uid then
      update public.friendships set status = 'accepted', updated_at = now() where id = v_row.id;
      return 'accepted';
    else
      return 'already_requested';
    end if;
  end if;

  -- Rate limit against code-guessing spam.
  if (select count(*) from public.friendships
      where requester_id = v_uid and status = 'pending') >= 50 then
    raise exception 'Too many pending requests' using errcode = 'P0001';
  end if;

  insert into public.friendships (requester_id, addressee_id) values (v_uid, v_other);
  return 'requested';
end;
$$;

/** Accept (true) or decline (false) a request sent TO me. Declining deletes it. */
create function private.respond_friend_request(p_friendship_id bigint, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if p_accept then
    update public.friendships set status = 'accepted', updated_at = now()
    where id = p_friendship_id and addressee_id = v_uid and status = 'pending';
  else
    delete from public.friendships
    where id = p_friendship_id and addressee_id = v_uid and status = 'pending';
  end if;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
end;
$$;

/** Cancel my request, remove a friend, or unblock (if I'm the blocker). */
create function private.remove_friend(p_other uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  delete from public.friendships
  where least(requester_id, addressee_id) = least(v_uid, p_other)
    and greatest(requester_id, addressee_id) = greatest(v_uid, p_other)
    and (status <> 'blocked' or blocked_by = v_uid);
  if not found then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
end;
$$;

/** Block someone: replaces any friendship/request between us. */
create function private.block_user(p_other uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if p_other = v_uid then
    raise exception 'You can’t block yourself' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_other) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  insert into public.friendships (requester_id, addressee_id, status, blocked_by)
  values (v_uid, p_other, 'blocked', v_uid)
  on conflict ((least(requester_id, addressee_id)), (greatest(requester_id, addressee_id)))
  do update set status = 'blocked', blocked_by = v_uid, updated_at = now()
  -- Never let someone overwrite a block that the OTHER person placed.
  where public.friendships.status <> 'blocked' or public.friendships.blocked_by = v_uid;
end;
$$;

/** My friends, incoming and outgoing requests, and people I blocked — with names and points. */
create function private.list_friends()
returns table (
  friendship_id bigint,
  other_id uuid,
  name text,
  kind text, -- 'friend' | 'incoming' | 'outgoing' | 'blocked'
  points_total integer,
  points_week integer,
  since timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    f.id,
    private.other_party(f, me.uid),
    private.public_name(private.other_party(f, me.uid)),
    case
      when f.status = 'accepted' then 'friend'
      when f.status = 'blocked' then 'blocked'
      when f.addressee_id = me.uid then 'incoming'
      else 'outgoing'
    end,
    -- Points only for accepted friends.
    case when f.status = 'accepted'
      then private.points_since(private.other_party(f, me.uid), '-infinity') end,
    case when f.status = 'accepted'
      then private.points_since(private.other_party(f, me.uid), now() - interval '7 days') end,
    f.updated_at
  from (select private.require_uid() as uid) me
  join public.friendships f on me.uid in (f.requester_id, f.addressee_id)
  where f.status <> 'blocked' or f.blocked_by = me.uid
  order by f.updated_at desc;
$$;

/** This week's points for me + accepted friends, highest first. */
create function private.friends_leaderboard()
returns table (user_id uuid, name text, points_week integer, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select private.require_uid() as uid),
  people as (
    select uid as id from me
    union
    select private.other_party(f, me.uid)
    from me join public.friendships f
      on f.status = 'accepted' and me.uid in (f.requester_id, f.addressee_id)
  )
  select p.id, private.public_name(p.id),
         private.points_since(p.id, now() - interval '7 days'),
         p.id = (select uid from me)
  from people p
  order by 3 desc, 2;
$$;

/** A friend's public profile. Only for accepted friends. */
create function private.friend_profile(p_friend uuid)
returns table (name text, points_total integer, routes_total integer, public_routes integer, friends_since timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if not private.are_friends(v_uid, p_friend) then
    raise exception 'Not friends' using errcode = '42501';
  end if;
  return query
  select
    private.public_name(p_friend),
    private.points_since(p_friend, '-infinity'),
    (select count(*)::integer from public.routes where created_by = p_friend),
    (select count(*)::integer from public.routes where public_author_id = p_friend),
    (select updated_at from public.friendships
      where least(requester_id, addressee_id) = least(v_uid, p_friend)
        and greatest(requester_id, addressee_id) = greatest(v_uid, p_friend));
end;
$$;

/** Recent routes by accepted friends — only ones they chose to show their name on. */
create function private.friend_activity(p_limit integer default 30)
returns table (route_id uuid, friend_id uuid, name text, title text, status public.route_status, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select private.require_uid() as uid),
  friends as (
    select private.other_party(f, me.uid) as id
    from me join public.friendships f
      on f.status = 'accepted' and me.uid in (f.requester_id, f.addressee_id)
  )
  select r.id, r.public_author_id, private.public_name(r.public_author_id), r.title, r.status, r.created_at
  from public.routes r
  join friends fr on fr.id = r.public_author_id -- public_author_id is set only when "show my name" is on
  where r.status <> 'retired'
  order by r.created_at desc
  limit least(greatest(p_limit, 1), 100);
$$;

-- Lock everything down, then open exactly what the wrappers need.
revoke execute on all functions in schema private from public, anon;
grant execute on function
  private.require_uid(),
  private.other_party(public.friendships, uuid),
  private.public_name(uuid),
  private.points_since(uuid, timestamptz),
  private.are_friends(uuid, uuid),
  private.my_friend_code(),
  private.send_friend_request(text),
  private.respond_friend_request(bigint, boolean),
  private.remove_friend(uuid),
  private.block_user(uuid),
  private.list_friends(),
  private.friends_leaderboard(),
  private.friend_profile(uuid),
  private.friend_activity(integer)
to authenticated;
-- Re-grant what earlier migrations granted (the blanket revoke above touched them too).
grant execute on function private.under_route_limit(), private.owns_route(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Public API (SECURITY INVOKER wrappers — the only friend functions the app can call)
-- ---------------------------------------------------------------------------
create function public.my_friend_code() returns text
language sql security invoker set search_path = ''
as $$ select private.my_friend_code() $$;

create function public.send_friend_request(p_code text) returns text
language sql security invoker set search_path = ''
as $$ select private.send_friend_request(p_code) $$;

create function public.respond_friend_request(p_friendship_id bigint, p_accept boolean) returns void
language sql security invoker set search_path = ''
as $$ select private.respond_friend_request(p_friendship_id, p_accept) $$;

create function public.remove_friend(p_other uuid) returns void
language sql security invoker set search_path = ''
as $$ select private.remove_friend(p_other) $$;

create function public.block_user(p_other uuid) returns void
language sql security invoker set search_path = ''
as $$ select private.block_user(p_other) $$;

create function public.list_friends()
returns table (friendship_id bigint, other_id uuid, name text, kind text, points_total integer, points_week integer, since timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.list_friends() $$;

create function public.friends_leaderboard()
returns table (user_id uuid, name text, points_week integer, is_me boolean)
language sql stable security invoker set search_path = ''
as $$ select * from private.friends_leaderboard() $$;

create function public.friend_profile(p_friend uuid)
returns table (name text, points_total integer, routes_total integer, public_routes integer, friends_since timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.friend_profile(p_friend) $$;

create function public.friend_activity(p_limit integer default 30)
returns table (route_id uuid, friend_id uuid, name text, title text, status public.route_status, created_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.friend_activity(p_limit) $$;

revoke execute on function
  public.my_friend_code(),
  public.send_friend_request(text),
  public.respond_friend_request(bigint, boolean),
  public.remove_friend(uuid),
  public.block_user(uuid),
  public.list_friends(),
  public.friends_leaderboard(),
  public.friend_profile(uuid),
  public.friend_activity(integer)
from public, anon;
grant execute on function
  public.my_friend_code(),
  public.send_friend_request(text),
  public.respond_friend_request(bigint, boolean),
  public.remove_friend(uuid),
  public.block_user(uuid),
  public.list_friends(),
  public.friends_leaderboard(),
  public.friend_profile(uuid),
  public.friend_activity(integer)
to authenticated;
