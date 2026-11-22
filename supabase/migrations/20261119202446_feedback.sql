-- Public web launch, step 7: the "Send feedback" form (DECISIONS D47).
-- Anyone signed in (including anonymous accounts) can send a short message; nobody can read
-- them in the app. The team reads them in the Supabase dashboard (docs/SETUP.md §9b).

create table public.feedback (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('bug', 'idea', 'wrong_route', 'other')),
  message text not null check (char_length(btrim(message)) between 1 and 1000),
  -- Where it was sent from ("web" / "ios" / "android") and the app version: helps reproduce bugs.
  platform text check (char_length(platform) <= 20),
  app_version text check (char_length(app_version) <= 20),
  created_at timestamptz not null default now()
);
create index feedback_user_id_idx on public.feedback (user_id);
create index feedback_created_at_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;
-- Write-only for users: what someone wrote stays between them and the team.
revoke all on table public.feedback from public, anon, authenticated;
grant insert (kind, message, platform, app_version) on table public.feedback to authenticated;

-- At most 10 messages per person per hour, so the table can't be flooded. Security definer:
-- users can't read the table themselves, so the policy can't count their rows directly.
create function private.feedback_quota_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) < 10
  from public.feedback
  where user_id = (select auth.uid()) and created_at > now() - interval '1 hour'
$$;
revoke execute on function private.feedback_quota_ok() from public, anon;
grant execute on function private.feedback_quota_ok() to authenticated;

create policy "signed-in users send feedback as themselves, 10 an hour"
  on public.feedback for insert
  to authenticated
  with check (user_id = (select auth.uid()) and (select private.feedback_quota_ok()));
