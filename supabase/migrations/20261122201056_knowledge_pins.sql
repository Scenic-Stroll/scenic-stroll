-- Knowledge pins, phase 1 (docs/PINS.md, DECISIONS D51): experts, pins and their sources, reading
-- versions and questions, a user's collection, the points ledger and per-user settings
-- (age band, safety mode, consent).
--
-- Who may do what (every rule has a test in supabase/tests/database.test.mjs):
--   * signed-in users read LIVE pins, their APPROVED versions and questions, and their sources;
--   * experts write their own pins while they are draft / in review; they can't approve or publish;
--   * admins (reviewers) approve versions and questions and set pins live (publish_pin);
--   * users read only their own collection, points and settings;
--   * nobody inserts points directly — only server functions do (phase 5);
--   * under-18s (safety mode) keep their collection on the device; the server stores only an
--     anonymous "pin unlocked" count (pin, day).

-- ---------------------------------------------------------------------------
-- Roles: admins and experts
-- ---------------------------------------------------------------------------

-- Admins review pins and add experts. Rows are added by hand in the dashboard (docs/PINS.md).
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on table public.admins from public, anon, authenticated;
grant select on table public.admins to authenticated;
create policy "users see whether they are an admin"
  on public.admins for select to authenticated
  using (user_id = (select auth.uid()));

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select exists (select 1 from public.admins where user_id = (select auth.uid())) $$;

-- Experts write pins. For the MVP an admin adds them after a manual check (ORCID iD stored as a
-- plain field; no ORCID sign-in yet).
create table public.experts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 80),
  field text not null check (char_length(btrim(field)) between 2 and 120),
  verification_method text not null check (verification_method in ('orcid', 'org_email', 'manual')),
  orcid_id text check (orcid_id ~ '^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$'),
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  check (verification_method <> 'orcid' or orcid_id is not null)
);
alter table public.experts enable row level security;
revoke all on table public.experts from public, anon, authenticated;
grant select (user_id, display_name, field, verification_method, verified_at)
  on table public.experts to authenticated;
grant insert, update, delete on table public.experts to authenticated;
-- Pin labels show who wrote a pin, so expert names and fields are readable. The ORCID iD and who
-- verified them are not in the column grant: the team reads those in the dashboard.
create policy "signed-in users read experts"
  on public.experts for select to authenticated using (true);
create policy "only admins add experts"
  on public.experts for insert to authenticated with check ((select private.is_admin()));
create policy "only admins change experts"
  on public.experts for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "only admins remove experts"
  on public.experts for delete to authenticated using ((select private.is_admin()));

create function private.is_expert()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select exists (select 1 from public.experts where user_id = (select auth.uid())) $$;

-- ---------------------------------------------------------------------------
-- Settings: age band, safety mode, reading style, consent
-- ---------------------------------------------------------------------------

create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  age_band text not null check (age_band in ('under_18', 'adult')),
  -- Follows the age band and can't be set by anyone: under-18 always means safety mode on.
  safety_mode boolean generated always as (age_band = 'under_18') stored,
  -- Any user may pick any reading style; it doesn't change safety mode.
  reading_style text not null default 'adult' check (reading_style in ('child', 'teen', 'adult')),
  research_opt_in boolean not null default false,
  gov_sharing_opt_in boolean not null default false,
  consent_version text not null check (char_length(consent_version) between 1 and 20),
  consented_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
revoke all on table public.user_settings from public, anon, authenticated;
grant select on table public.user_settings to authenticated;
grant insert (age_band, reading_style, research_opt_in, gov_sharing_opt_in, consent_version)
  on table public.user_settings to authenticated;
grant update (age_band, reading_style, research_opt_in, gov_sharing_opt_in, consent_version)
  on table public.user_settings to authenticated;
-- No delete: deleting and re-creating the row must not be a way out of safety mode.
create policy "users read their own settings"
  on public.user_settings for select to authenticated using (user_id = (select auth.uid()));
create policy "users create their own settings"
  on public.user_settings for insert to authenticated with check (user_id = (select auth.uid()));
create policy "users change their own settings"
  on public.user_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Once under-18, always under-18 for this account (only an admin can correct a mistake), and a
-- new consent stamps the time.
create function private.user_settings_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.age_band = 'under_18' and new.age_band <> 'under_18' and not private.is_admin() then
    raise exception 'Safety mode can''t be turned off for this account' using errcode = '42501';
  end if;
  if new.consent_version is distinct from old.consent_version then
    new.consented_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function private.user_settings_guard() from public, anon, authenticated;
create trigger user_settings_guard
  before update on public.user_settings
  for each row execute function private.user_settings_guard();

-- True when the signed-in user is in safety mode (under 18). No settings yet = treat as safe.
create function private.in_safety_mode()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.safety_mode from public.user_settings s where s.user_id = (select auth.uid())),
    true
  )
$$;

-- ---------------------------------------------------------------------------
-- Pins and their sources
-- ---------------------------------------------------------------------------

create table public.pins (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  -- The point is the truth; place_* only says what the pin is attached to (docs/PINS_AUDIT.md §5).
  location extensions.geometry(Point, 4326) not null,
  place_kind text not null check (place_kind in ('ped_node', 'osm', 'custom')),
  ped_build_id bigint,
  ped_node_id integer,
  osm_id text check (osm_id ~ '^(node|way|relation)/\d+$'),
  place_description text check (char_length(btrim(place_description)) between 5 and 200),
  radius_m integer not null default 40 check (radius_m between 30 and 50),
  topics text[] not null default '{}',
  sdg_tags integer[] not null default '{}'
    check (sdg_tags <@ array[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]),
  label text not null default 'ai_summarized' check (label in ('expert_verified', 'ai_summarized')),
  status text not null default 'draft' check (status in ('draft', 'in_review', 'live', 'paused')),
  author_expert_id uuid not null references public.experts (user_id) on delete restrict,
  beyond_hk_text text check (char_length(btrim(beyond_hk_text)) between 5 and 300),
  beyond_hk_source_id uuid,
  -- Seeded examples (e.g. "Why Kent Road is in Kowloon") are marked so nobody mistakes them.
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (place_kind = 'ped_node' and ped_build_id is not null and ped_node_id is not null)
    or (place_kind = 'osm' and osm_id is not null)
    or (place_kind = 'custom' and place_description is not null)
  ),
  -- "Why it matters beyond Hong Kong" needs its own source.
  check (beyond_hk_text is null or beyond_hk_source_id is not null)
);
create index pins_location_idx on public.pins using gist (location);
create index pins_author_idx on public.pins (author_expert_id);
create index pins_status_idx on public.pins (status);

create table public.pin_sources (
  id uuid primary key default gen_random_uuid(),
  pin_id uuid not null references public.pins (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 300),
  url text not null check (url ~ '^https?://'),
  doi text check (doi ~ '^10\.\d{4,9}/\S+$'),
  source_db text not null check (source_db in ('openalex', 'crossref', 'semantic_scholar', 'web')),
  is_open_access boolean not null default false,
  created_at timestamptz not null default now()
);
create index pin_sources_pin_idx on public.pin_sources (pin_id);

alter table public.pins
  add constraint pins_beyond_hk_source_fk foreign key (beyond_hk_source_id)
  references public.pin_sources (id) on delete set null deferrable initially deferred;

-- May the signed-in user edit this pin? Its author while it is a draft / in review, or an admin.
create function private.can_edit_pin(p_pin uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin() or exists (
    select 1 from public.pins p
    where p.id = p_pin
      and p.author_expert_id = (select auth.uid())
      and p.status in ('draft', 'in_review')
  )
$$;

-- May the signed-in user see this pin's unpublished parts? Its author or an admin.
create function private.can_see_pin_drafts(p_pin uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin() or exists (
    select 1 from public.pins p where p.id = p_pin and p.author_expert_id = (select auth.uid())
  )
$$;

alter table public.pins enable row level security;
revoke all on table public.pins from public, anon, authenticated;
grant select on table public.pins to authenticated;
grant insert (
  title, location, place_kind, ped_build_id, ped_node_id, osm_id, place_description, radius_m,
  topics, sdg_tags, status, author_expert_id, beyond_hk_text, beyond_hk_source_id
) on table public.pins to authenticated;
grant update (
  title, location, place_kind, ped_build_id, ped_node_id, osm_id, place_description, radius_m,
  topics, sdg_tags, status, beyond_hk_text, beyond_hk_source_id
) on table public.pins to authenticated;
grant delete on table public.pins to authenticated;

create policy "live pins for everyone signed in; drafts for their author and admins"
  on public.pins for select to authenticated
  using (status = 'live' or author_expert_id = (select auth.uid()) or (select private.is_admin()));
create policy "experts create their own draft pins"
  on public.pins for insert to authenticated
  with check (
    author_expert_id = (select auth.uid())
    and (select private.is_expert())
    and status in ('draft', 'in_review')
  );
create policy "authors edit drafts; admins edit any pin"
  on public.pins for update to authenticated
  using ((select private.can_edit_pin(id)))
  with check (
    (select private.is_admin())
    or (author_expert_id = (select auth.uid()) and status in ('draft', 'in_review'))
  );
create policy "authors delete drafts; admins delete any pin"
  on public.pins for delete to authenticated
  using ((select private.can_edit_pin(id)));

-- Only publish_pin (admins) may set a pin live, pause it or change its label.
create function private.pins_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.status in ('live', 'paused') and new.status is distinct from old.status
       and coalesce(current_setting('scenic.publishing', true), '') <> 'on' then
      raise exception 'Pins go live or pause only through publish_pin / pause_pin (admins)'
        using errcode = '42501';
    end if;
    new.updated_at := now();
  end if;
  if tg_op = 'INSERT' and new.status in ('live', 'paused') then
    raise exception 'New pins start as draft or in review' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function private.pins_guard() from public, anon, authenticated;
create trigger pins_guard
  before insert or update on public.pins
  for each row execute function private.pins_guard();

alter table public.pin_sources enable row level security;
revoke all on table public.pin_sources from public, anon, authenticated;
grant select on table public.pin_sources to authenticated;
grant insert (pin_id, title, url, doi, source_db, is_open_access) on table public.pin_sources to authenticated;
grant update (title, url, doi, source_db, is_open_access) on table public.pin_sources to authenticated;
grant delete on table public.pin_sources to authenticated;
create policy "sources are readable when their pin is"
  on public.pin_sources for select to authenticated
  using (exists (select 1 from public.pins p where p.id = pin_id));
create policy "pin editors add sources"
  on public.pin_sources for insert to authenticated
  with check ((select private.can_edit_pin(pin_id)));
create policy "pin editors change sources"
  on public.pin_sources for update to authenticated
  using ((select private.can_edit_pin(pin_id))) with check ((select private.can_edit_pin(pin_id)));
create policy "pin editors remove sources"
  on public.pin_sources for delete to authenticated
  using ((select private.can_edit_pin(pin_id)));

-- ---------------------------------------------------------------------------
-- Reading versions and their questions
-- ---------------------------------------------------------------------------

create table public.pin_versions (
  id uuid primary key default gen_random_uuid(),
  pin_id uuid not null references public.pins (id) on delete cascade,
  reading_level text not null check (reading_level in ('child', 'teen', 'adult')),
  body text not null check (char_length(btrim(body)) between 10 and 4000),
  status text not null default 'in_review' check (status in ('draft', 'in_review', 'approved')),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  generated_by_ai boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pin_id, reading_level)
);

create table public.pin_questions (
  id uuid primary key default gen_random_uuid(),
  pin_version_id uuid not null references public.pin_versions (id) on delete cascade,
  prompt text not null check (char_length(btrim(prompt)) between 5 and 300),
  -- 2–5 answer options, as a JSON array of strings; `answer` must be one of them.
  options jsonb not null check (
    jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 5
  ),
  answer text not null,
  explanation text not null check (char_length(btrim(explanation)) between 5 and 600),
  status text not null default 'in_review' check (status in ('in_review', 'approved')),
  created_at timestamptz not null default now(),
  check (options ? answer)
);
create index pin_questions_version_idx on public.pin_questions (pin_version_id);

alter table public.pin_versions enable row level security;
revoke all on table public.pin_versions from public, anon, authenticated;
grant select on table public.pin_versions to authenticated;
grant insert (pin_id, reading_level, body, status, generated_by_ai) on table public.pin_versions to authenticated;
grant update (body, status) on table public.pin_versions to authenticated;
grant delete on table public.pin_versions to authenticated;
create policy "approved versions of live pins; everything for authors and admins"
  on public.pin_versions for select to authenticated
  using (
    (status = 'approved' and exists (select 1 from public.pins p where p.id = pin_id and p.status = 'live'))
    or (select private.can_see_pin_drafts(pin_id))
  );
create policy "pin editors add versions"
  on public.pin_versions for insert to authenticated
  with check ((select private.can_edit_pin(pin_id)));
create policy "pin editors change versions"
  on public.pin_versions for update to authenticated
  using ((select private.can_edit_pin(pin_id))) with check ((select private.can_edit_pin(pin_id)));
create policy "pin editors remove versions"
  on public.pin_versions for delete to authenticated
  using ((select private.can_edit_pin(pin_id)));

alter table public.pin_questions enable row level security;
revoke all on table public.pin_questions from public, anon, authenticated;
grant select on table public.pin_questions to authenticated;
grant insert (pin_version_id, prompt, options, answer, explanation, status) on table public.pin_questions to authenticated;
grant update (prompt, options, answer, explanation, status) on table public.pin_questions to authenticated;
grant delete on table public.pin_questions to authenticated;

create function private.version_pin(p_version uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$ select pin_id from public.pin_versions where id = p_version $$;

create policy "approved questions of approved versions of live pins; everything for authors and admins"
  on public.pin_questions for select to authenticated
  using (
    (
      status = 'approved'
      and exists (
        select 1 from public.pin_versions v join public.pins p on p.id = v.pin_id
        where v.id = pin_version_id and v.status = 'approved' and p.status = 'live'
      )
    )
    or (select private.can_see_pin_drafts(private.version_pin(pin_version_id)))
  );
create policy "pin editors add questions"
  on public.pin_questions for insert to authenticated
  with check ((select private.can_edit_pin(private.version_pin(pin_version_id))));
create policy "pin editors change questions"
  on public.pin_questions for update to authenticated
  using ((select private.can_edit_pin(private.version_pin(pin_version_id))))
  with check ((select private.can_edit_pin(private.version_pin(pin_version_id))));
create policy "pin editors remove questions"
  on public.pin_questions for delete to authenticated
  using ((select private.can_edit_pin(private.version_pin(pin_version_id))));

-- Review rules for versions:
--   * only admins approve (and their id and time are recorded);
--   * changing the text sends the version AND all its questions back to review, and a live pin
--     whose adult text changed goes back to review too (readers never see unchecked text).
create function private.pin_versions_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    if not private.is_admin() then
      raise exception 'Only reviewers (admins) approve versions' using errcode = '42501';
    end if;
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  if tg_op = 'UPDATE' and new.body is distinct from old.body then
    new.status := 'in_review';
    new.reviewed_by := null;
    new.reviewed_at := null;
    update public.pin_questions set status = 'in_review' where pin_version_id = new.id;
    if new.reading_level = 'adult' then
      update public.pins set status = 'in_review' where id = new.pin_id and status = 'live';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function private.pin_versions_review() from public, anon, authenticated;
create trigger pin_versions_review
  before insert or update on public.pin_versions
  for each row execute function private.pin_versions_review();

-- Only admins approve questions; changing a question sends it back to review.
create function private.pin_questions_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    if not private.is_admin() then
      raise exception 'Only reviewers (admins) approve questions' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.status = 'approved' and new.status = 'approved' and (
    new.prompt is distinct from old.prompt or new.options is distinct from old.options
    or new.answer is distinct from old.answer or new.explanation is distinct from old.explanation
  ) then
    new.status := 'in_review';
  end if;
  return new;
end;
$$;
revoke execute on function private.pin_questions_review() from public, anon, authenticated;
create trigger pin_questions_review
  before insert or update on public.pin_questions
  for each row execute function private.pin_questions_review();

-- Admins set a pin live. Only when its adult version and all that version's questions are approved.
-- Label: "expert_verified" if the author is a verified expert AND the adult text was approved by a
-- verified expert; otherwise "ai_summarized".
create function public.publish_pin(p_pin uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_adult public.pin_versions;
  v_label text;
begin
  if not private.is_admin() then
    raise exception 'Only reviewers (admins) publish pins' using errcode = '42501';
  end if;
  select * into v_adult from public.pin_versions where pin_id = p_pin and reading_level = 'adult';
  if v_adult.id is null or v_adult.status <> 'approved' then
    raise exception 'The adult version must be approved first' using errcode = '22023';
  end if;
  if not exists (select 1 from public.pin_questions where pin_version_id = v_adult.id) then
    raise exception 'The adult version needs at least one question' using errcode = '22023';
  end if;
  if exists (select 1 from public.pin_questions where pin_version_id = v_adult.id and status <> 'approved') then
    raise exception 'All questions of the adult version must be approved first' using errcode = '22023';
  end if;
  select case
    when exists (
      select 1 from public.pins p join public.experts e on e.user_id = p.author_expert_id
      where p.id = p_pin and e.verified_at is not null
    ) and exists (
      select 1 from public.experts e where e.user_id = v_adult.reviewed_by and e.verified_at is not null
    ) then 'expert_verified'
    else 'ai_summarized'
  end into v_label;
  perform set_config('scenic.publishing', 'on', true);
  update public.pins set status = 'live', label = v_label where id = p_pin;
  perform set_config('scenic.publishing', '', true);
  return v_label;
end;
$$;
revoke execute on function public.publish_pin(uuid) from public, anon;
grant execute on function public.publish_pin(uuid) to authenticated;

create function public.pause_pin(p_pin uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Only reviewers (admins) pause pins' using errcode = '42501';
  end if;
  perform set_config('scenic.publishing', 'on', true);
  update public.pins set status = 'paused' where id = p_pin and status = 'live';
  perform set_config('scenic.publishing', '', true);
end;
$$;
revoke execute on function public.pause_pin(uuid) from public, anon;
grant execute on function public.pause_pin(uuid) to authenticated;

-- Live pins with plain lat/lng, for the map (the app can't read PostGIS points directly).
create view public.pins_map
with (security_invoker = true)
as
select
  p.id, p.title, p.label, p.radius_m, p.topics, p.status, p.is_sample, p.place_kind,
  p.place_description,
  extensions.st_y(p.location) as lat,
  extensions.st_x(p.location) as lng
from public.pins p;
grant select on public.pins_map to authenticated;

-- ---------------------------------------------------------------------------
-- Collection (adults) and anonymous unlock counts (under-18s)
-- ---------------------------------------------------------------------------

create table public.collection_entries (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pin_id uuid not null references public.pins (id) on delete cascade,
  collected_at timestamptz not null default now(),
  read_at timestamptz,
  read_level text check (read_level in ('child', 'teen', 'adult')),
  primary key (user_id, pin_id)
);
create index collection_entries_pin_idx on public.collection_entries (pin_id);
alter table public.collection_entries enable row level security;
revoke all on table public.collection_entries from public, anon, authenticated;
grant select on table public.collection_entries to authenticated;
grant insert (pin_id) on table public.collection_entries to authenticated;
-- read_at / read_level are set by finish_pin_read (phase 5), not by the client.
create policy "users read their own collection"
  on public.collection_entries for select to authenticated using (user_id = (select auth.uid()));
create policy "adults collect live pins, as themselves"
  on public.collection_entries for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and not (select private.in_safety_mode())
    and exists (select 1 from public.pins p where p.id = pin_id and p.status = 'live')
  );

-- Under-18s: only "this pin was unlocked on this day" — no user, no time, no place.
create table public.pin_unlock_counts (
  pin_id uuid not null references public.pins (id) on delete cascade,
  unlocked_on date not null,
  unlocks integer not null default 0,
  primary key (pin_id, unlocked_on)
);
alter table public.pin_unlock_counts enable row level security;
revoke all on table public.pin_unlock_counts from public, anon, authenticated;

create function public.record_pin_unlock(p_pin uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if not exists (select 1 from public.pins where id = p_pin and status = 'live') then
    raise exception 'Unknown pin' using errcode = '22023';
  end if;
  insert into public.pin_unlock_counts (pin_id, unlocked_on, unlocks)
  values (p_pin, (now() at time zone 'Asia/Hong_Kong')::date, 1)
  on conflict (pin_id, unlocked_on) do update set unlocks = public.pin_unlock_counts.unlocks + 1;
end;
$$;
revoke execute on function public.record_pin_unlock(uuid) from public, anon;
grant execute on function public.record_pin_unlock(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Points ledger (append-only; written only by server functions — phase 5)
-- ---------------------------------------------------------------------------

create table public.points_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('distance', 'pin_read', 'board_done', 'contribution')),
  amount integer not null check (amount >= 0),
  -- What earned it (a walk id, a pin id, …). One award per user, source and thing: retries are safe.
  ref_id text not null check (char_length(ref_id) between 1 and 100),
  occurred_on date not null default (now() at time zone 'Asia/Hong_Kong')::date,
  created_at timestamptz not null default now(),
  unique (user_id, source, ref_id)
);
create index points_ledger_user_day_idx on public.points_ledger (user_id, occurred_on);
alter table public.points_ledger enable row level security;
revoke all on table public.points_ledger from public, anon, authenticated;
grant select on table public.points_ledger to authenticated;
create policy "users read their own points"
  on public.points_ledger for select to authenticated using (user_id = (select auth.uid()));

-- Append-only, for everyone (the server functions included): corrections are new rows.
create function private.points_ledger_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'The points ledger is append-only' using errcode = '42501';
end;
$$;
revoke execute on function private.points_ledger_append_only() from public, anon, authenticated;
create trigger points_ledger_append_only
  before update or delete on public.points_ledger
  for each row execute function private.points_ledger_append_only();
