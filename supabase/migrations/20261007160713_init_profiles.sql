-- Phase 0: PostGIS + user profiles.
-- Every signed-in user (including anonymous users) gets a row in public.profiles automatically.
--
-- Security model (see DECISIONS.md D3):
--   * RLS is enabled on every table.
--   * New tables are NOT exposed to the Data API by default, so we GRANT explicitly.
--   * Users may read all profiles, but may only update their own display settings — never `points`.

-- PostGIS lives in the `extensions` schema (Supabase convention), used from Phase 1 on.
create extension if not exists postgis with schema extensions;

-- Schema for internal helpers that must never be callable through the API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 40),
  is_anonymous_default boolean not null default true,
  points integer not null default 0 check (points >= 0),
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per auth user. Points are only changed by server-side functions.';

alter table public.profiles enable row level security;

-- Start from zero privileges, then grant exactly what the app needs.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to anon, authenticated;
-- Column-level grant: users can never write `points` or `id` themselves.
grant update (display_name, is_anonymous_default) on table public.profiles to authenticated;

create policy "profiles are readable by everyone"
  on public.profiles for select
  to anon, authenticated
  using (true);

create policy "users update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- Auto-create a profile when a user signs up (anonymous or email).
-- SECURITY DEFINER is required because the trigger runs as the auth service,
-- which has no rights on public.profiles. It lives in `private` and takes no input
-- from the caller, so it cannot be abused through the API.
-- ---------------------------------------------------------------------------
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
