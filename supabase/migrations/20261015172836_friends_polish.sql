-- Follow-ups from the live test of step 6:
--  * "Walker ????" appeared for people who never opened Add friend (no friend code yet).
--    Fall back to the first 4 characters of their user id instead.
--  * Performance advisor: index the friendships.requester_id foreign key.

create or replace function private.public_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select display_name from public.profiles where id = p_user),
    'Walker ' || coalesce(
      (select right(code, 4) from public.friend_codes where user_id = p_user),
      upper(left(replace(p_user::text, '-', ''), 4))
    )
  );
$$;

create index friendships_requester_idx on public.friendships (requester_id);
