-- Redesign step 6: opt-in live location sharing with friends.
--
-- Rules (enforced here, not in the app):
--   * You can read someone's share only if: you're an ACCEPTED friend, it hasn't expired, it was
--     updated in the last 30 minutes (a killed app can't leave a dot behind), and — if they chose
--     specific friends — you're on their list.
--   * "Approximate" shares are snapped to a ~200 m grid by a trigger BEFORE they are stored, so the
--     exact point never reaches the database.
--   * Hong Kong only. Foreground updates only (the app sends one about every 15 s while open).

create type public.share_precision as enum ('exact', 'approximate');

create table public.location_shares (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  point extensions.geometry(Point, 4326) not null,
  accuracy_m real check (accuracy_m >= 0),
  precision_mode public.share_precision not null default 'exact',
  share_with_all boolean not null default true,
  updated_at timestamptz not null default now(), -- set by trigger
  expires_at timestamptz -- null = until the user stops (still hidden after 30 min without updates)
);

create index location_shares_point_idx on public.location_shares using gist (point);

create table public.location_share_recipients (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  primary key (owner_id, recipient_id)
);
create index location_share_recipients_recipient_idx on public.location_share_recipients (recipient_id);

-- Snap approximate shares, stamp the time, keep it in Hong Kong.
create function private.location_shares_prepare()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_lat float8 := extensions.st_y(new.point);
  v_lng float8 := extensions.st_x(new.point);
begin
  if v_lat not between 22.1 and 22.6 or v_lng not between 113.8 and 114.5 then
    raise exception 'Location must be in Hong Kong' using errcode = '22023';
  end if;
  if new.precision_mode = 'approximate' then
    -- 0.002° ≈ 220 m north–south and ≈ 205 m east–west at Hong Kong's latitude.
    new.point := extensions.st_setsrid(
      extensions.st_makepoint(round(v_lng / 0.002) * 0.002, round(v_lat / 0.002) * 0.002), 4326);
    new.accuracy_m := greatest(coalesce(new.accuracy_m, 0), 200);
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function private.location_shares_prepare() from public, anon, authenticated;

create trigger location_shares_prepare
  before insert or update on public.location_shares
  for each row execute function private.location_shares_prepare();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.location_shares enable row level security;
alter table public.location_share_recipients enable row level security;

revoke all on table public.location_shares from anon, authenticated;
grant select on table public.location_shares to authenticated;
grant insert (point, accuracy_m, precision_mode, share_with_all, expires_at)
  on table public.location_shares to authenticated;
grant update (point, accuracy_m, precision_mode, share_with_all, expires_at)
  on table public.location_shares to authenticated;
grant delete on table public.location_shares to authenticated;

revoke all on table public.location_share_recipients from anon, authenticated;
grant select, delete on table public.location_share_recipients to authenticated;
grant insert (recipient_id) on table public.location_share_recipients to authenticated;

create policy "see your own share, or an accepted friend's live share meant for you"
  on public.location_shares for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (
      (expires_at is null or expires_at > now())
      and updated_at > now() - interval '30 minutes'
      -- friendships rows are visible to the two people in them, so this subquery works for the viewer.
      and exists (
        select 1 from public.friendships f
        where f.status = 'accepted'
          and least(f.requester_id, f.addressee_id) = least(user_id, (select auth.uid()))
          and greatest(f.requester_id, f.addressee_id) = greatest(user_id, (select auth.uid()))
      )
      and (
        share_with_all
        or exists (
          select 1 from public.location_share_recipients r
          where r.owner_id = user_id and r.recipient_id = (select auth.uid())
        )
      )
    )
  );

create policy "users manage only their own share (insert)"
  on public.location_shares for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "users manage only their own share (update)"
  on public.location_shares for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "users manage only their own share (delete)"
  on public.location_shares for delete
  to authenticated
  using (user_id = (select auth.uid()));

create policy "owners and recipients see share-list rows"
  on public.location_share_recipients for select
  to authenticated
  using ((select auth.uid()) in (owner_id, recipient_id));

create policy "owners add accepted friends to their share list"
  on public.location_share_recipients for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and least(f.requester_id, f.addressee_id) = least(owner_id, recipient_id)
        and greatest(f.requester_id, f.addressee_id) = greatest(owner_id, recipient_id)
    )
  );

create policy "owners remove people from their share list"
  on public.location_share_recipients for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- API (SECURITY INVOKER: every policy above applies)
-- ---------------------------------------------------------------------------

/** Start (or change) sharing. p_recipients is ignored when p_share_with_all is true. */
create function public.start_location_share(
  p_lat float8,
  p_lng float8,
  p_accuracy_m real,
  p_precision public.share_precision,
  p_share_with_all boolean,
  p_minutes integer, -- null = until I stop
  p_recipients uuid[] default '{}'
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  if p_minutes is not null and p_minutes not between 1 and 1440 then
    raise exception 'Duration must be 1–1440 minutes' using errcode = '22023';
  end if;
  if not p_share_with_all and coalesce(cardinality(p_recipients), 0) = 0 then
    raise exception 'Choose at least one friend' using errcode = '22023';
  end if;

  insert into public.location_shares (point, accuracy_m, precision_mode, share_with_all, expires_at)
  values (
    extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326),
    p_accuracy_m,
    p_precision,
    p_share_with_all,
    case when p_minutes is null then null else now() + make_interval(mins => p_minutes) end
  )
  on conflict (user_id) do update set
    point = excluded.point,
    accuracy_m = excluded.accuracy_m,
    precision_mode = excluded.precision_mode,
    share_with_all = excluded.share_with_all,
    expires_at = excluded.expires_at;

  delete from public.location_share_recipients where owner_id = v_uid;
  if not p_share_with_all then
    -- The insert policy rejects anyone who isn't an accepted friend.
    insert into public.location_share_recipients (recipient_id)
    select distinct unnest(p_recipients);
  end if;
end;
$$;

/** Periodic position update while sharing (keeps the chosen precision, audience and expiry). */
create function public.update_location_share(p_lat float8, p_lng float8, p_accuracy_m real)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.location_shares
  set point = extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326),
      accuracy_m = p_accuracy_m
  where user_id = (select auth.uid())
    and (expires_at is null or expires_at > now());
  return found; -- false → the share expired or was stopped; the app stops updating
end;
$$;

create function public.stop_location_share()
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.location_share_recipients where owner_id = (select auth.uid());
  delete from public.location_shares where user_id = (select auth.uid());
$$;

/** Friends' live locations visible to me (RLS does the filtering). */
create function public.friend_locations()
returns table (
  user_id uuid,
  name text,
  lat float8,
  lng float8,
  accuracy_m real,
  precision_mode public.share_precision,
  updated_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select ls.user_id, private.public_name(ls.user_id),
         extensions.st_y(ls.point), extensions.st_x(ls.point),
         ls.accuracy_m, ls.precision_mode, ls.updated_at, ls.expires_at
  from public.location_shares ls
  where ls.user_id <> (select auth.uid());
$$;

/** My own current share (or no row), so the app can show "You're sharing" after a restart. */
create function public.my_location_share()
returns table (precision_mode public.share_precision, share_with_all boolean, expires_at timestamptz, updated_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select precision_mode, share_with_all, expires_at, updated_at
  from public.location_shares where user_id = (select auth.uid());
$$;

revoke execute on function
  public.start_location_share(float8, float8, real, public.share_precision, boolean, integer, uuid[]),
  public.update_location_share(float8, float8, real),
  public.stop_location_share(),
  public.friend_locations(),
  public.my_location_share()
from public, anon;
grant execute on function
  public.start_location_share(float8, float8, real, public.share_precision, boolean, integer, uuid[]),
  public.update_location_share(float8, float8, real),
  public.stop_location_share(),
  public.friend_locations(),
  public.my_location_share()
to authenticated;

-- Realtime: friends' maps get a ping when a share changes (RLS decides who receives it).
alter publication supabase_realtime add table public.location_shares;
