-- Knowledge pins, phase 2 (D52): safety mode for under-18s, enforced by the database itself, so it
-- holds whatever the app does. Under-18 accounts can't store route recordings or friend data:
-- no routes, descriptions, friend codes, friend requests or location sharing.
-- An account that switches to under-18 loses the friend data, shares and recordings it already had.

-- Under 18 according to the user's settings. No settings = not known to be a minor (accounts from
-- before the consent screen keep working until they answer it; the app asks first thing).
create function private.is_minor(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_settings s where s.user_id = p_user and s.age_band = 'under_18'
  )
$$;

create function private.block_minors()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_minor((select auth.uid())) then
    raise exception '% is not available in safety mode (under 18)', tg_argv[0]
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function private.block_minors() from public, anon, authenticated;

create trigger routes_block_minors
  before insert on public.routes
  for each row execute function private.block_minors('Route recording');
create trigger route_descriptions_block_minors
  before insert on public.route_descriptions
  for each row execute function private.block_minors('Describing routes');
create trigger friend_codes_block_minors
  before insert on public.friend_codes
  for each row execute function private.block_minors('Friends');
create trigger friendships_block_minors
  before insert on public.friendships
  for each row execute function private.block_minors('Friends');
create trigger location_shares_block_minors
  before insert or update on public.location_shares
  for each row execute function private.block_minors('Location sharing');
create trigger location_share_recipients_block_minors
  before insert on public.location_share_recipients
  for each row execute function private.block_minors('Location sharing');

-- Switching to under-18 removes what an under-18 account may not have on the server.
create function private.user_settings_became_minor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.age_band = 'under_18' and (tg_op = 'INSERT' or old.age_band <> 'under_18') then
    delete from public.location_share_recipients
      where owner_id = new.user_id or recipient_id = new.user_id;
    delete from public.location_shares where user_id = new.user_id;
    delete from public.friendships where new.user_id in (requester_id, addressee_id);
    delete from public.friend_codes where user_id = new.user_id;
    delete from public.route_descriptions where author_id = new.user_id;
    delete from public.routes where created_by = new.user_id;
  end if;
  return new;
end;
$$;
revoke execute on function private.user_settings_became_minor() from public, anon, authenticated;
create trigger user_settings_became_minor
  after insert or update of age_band on public.user_settings
  for each row execute function private.user_settings_became_minor();
