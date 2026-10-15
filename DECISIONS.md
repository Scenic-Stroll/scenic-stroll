# Decisions log

Choices not fixed by the build prompt. Newest at the bottom. Format: **decision** — why — consequences.

### D1 · Hosted Supabase project, no local Supabase stack (2026-10-07)

Local `supabase start` needs Docker, which isn't installed on the lead dev machine and is heavy for first-year
teammates. We develop against one shared hosted free-tier project (region: Singapore, closest to HK).
Edge Functions deploy with `supabase functions deploy --use-api` (no Docker needed).
Consequence: migrations are applied with `supabase db push`; be careful — there is one shared database.

### D2 · Expo SDK 57 (2026-10-07)

Expo Go from the stores only runs the latest SDK. SDK 57 is current. Everyone must update Expo Go.

### D3 · Explicit GRANTs in every migration (2026-10-07)

Since 2026-04-28 Supabase no longer auto-exposes new `public` tables to the Data API. Each migration grants
`select` / `insert` / `update` / `delete` to `anon` / `authenticated` as needed, **and** enables RLS.

### D4 · `/shared` uses explicit `.ts` import extensions (2026-10-07)

The same files run in Metro (app), Vitest (Node) and Deno (Edge Functions). Deno requires file extensions;
`allowImportingTsExtensions` makes TypeScript accept them. `zod` is imported bare everywhere; Deno will map it
through an import map in `supabase/functions/` (added with the first Edge Function in Phase 1, together with
the decision on how functions load `/shared`).

### D5 · Session storage in AsyncStorage, not SecureStore (2026-10-07)

Supabase's Expo tutorial encrypts the session with SecureStore + AES. For an anonymous-by-default prototype
that adds two native-ish deps and complexity for little gain, so we use plain AsyncStorage (Supabase's
documented option). Revisit if we ship beyond the hackathon.

### D6 · Template trimmed to native only (2026-10-07)

We don't ship a web build. Removed the Expo template's web-only files (`global.css`, `*.web.tsx`) and demo
screens. `npm run start` + Expo Go is the only supported way to run the app.

### D7 · Landmark presets live in `shared/src/presets.ts`, sourced from OpenStreetMap (2026-10-07)

The spec says "store presets in /supabase/seed". The app needs them offline (MTR stations have no signal), so the
typed list in `/shared` is the source of truth; a seed SQL file will be generated from it when the database
needs presets (Phase 4 stitching). Coordinates come from OSM (ODbL — attribution shown in Settings). Festival
Walk entrances and CityU gates are not named in OSM, so they are left for the team to capture on Oct 10.

### D8 · Edge Functions get `/shared` through a generated copy (2026-10-07)

Supabase bundles each function from inside `supabase/functions/`; importing `../../shared` isn't documented as
supported. `npm run sync-shared` copies `shared/src` to `supabase/functions/_shared/scenic/` (git-ignored, never
edited by hand). `npm test`, `npm run check:functions` and `npm run deploy:functions` run it automatically.
Each function has its own `deno.json` mapping `zod` → `npm:zod@4.6.5` (Supabase recommends per-function config).

### D9 · Free-text search runs on "Search", not on every keystroke (2026-10-07)

Protects the ORS free-tier quota (geocoding is rate-limited). Landmarks still filter instantly as you type.

### D10 · Edge Functions use `@supabase/server` (`withSupabase`), platform `verify_jwt` off (2026-10-07)

Supabase now treats bare `Deno.serve` + manual clients as legacy. `withSupabase({ auth: 'user' })` verifies the
caller inside the function (works with the project's asymmetric JWT signing keys), handles CORS, and later gives
`ctx.supabase` (RLS as the user) / `ctx.supabaseAdmin`. Because the handler verifies, `verify_jwt = false` is set
per function in `config.toml` so the platform check can't reject valid new-style tokens. Verified locally:
no token → 401 `MISSING_CREDENTIALS`, forged token → 401 `INVALID_JWT`.
Also: `deno check` must run with each function's own `--config`, otherwise Deno resolves packages from the repo's
`node_modules` and hides missing import-map entries (`npm run check:functions` does this).

### D11 · Hiding route authors: column privileges + one SECURITY DEFINER helper (2026-10-07)

`routes.created_by` / `route_descriptions.author_id` have no SELECT grant, so the API can't return them.
Tested on Postgres 17 (PGlite): a policy may read a hidden column of **its own** table (owner can edit/delete),
but a policy on **another** table cannot (checkpoint inserts failed even for the owner). So checkpoint
ownership uses `private.owns_route(id)` — SECURITY DEFINER, in the non-exposed `private` schema, answers only
"does the _current_ user own this route", EXECUTE for `authenticated` only, not callable directly (no schema
usage). `public_author_id` is filled by a trigger only when `show_author` is on. All verified by
`supabase/tests/database.test.mjs`, which runs every migration on PGlite + PostGIS (no Docker).

### D12 · 50 m privacy trim: on by default, off in data collection mode (2026-10-07)

PDPO "collect the minimum" → trim on for normal users. The team's Oct 10–11 walks start at MTR exits and
campus buildings, where trimming would cut off the interesting part, so data collection mode defaults it off.
Either way it's a visible switch on the review screen.

### D13 · Where a checkpoint is placed (2026-10-07)

GPS indoors is weak, so a checkpoint uses the latest fix if it's < 15 s old and accurate to ≤ 60 m
(2 × the normal limit), otherwise the last accepted track point. A gap's checkpoint added on the review screen
is placed at the last good point before the gap.

### D14 · One list of function names; deployment is checked, not assumed (2026-10-07)

Bug: the map showed "Requested function was not found" — `plan-route` and `geocode` were written and tested
but never deployed (HTTP 404 `NOT_FOUND` from the project; names and project ref were correct).
Fixes: (1) deployed both; (2) every function name lives in `FUNCTIONS` (`shared/src/api.ts`), the app calls
only through it, and a unit test checks each has a folder + `config.toml` block; (3) `npm run check:functions`
fails on hand-typed names, missing folders/config, or a function that answers 404 on the live project;
(4) every function answers GET with a health report listing missing secret _names_ (never values), shown in
Settings → Diagnostics; (5) the app maps errors to actionable messages (not deployed / not signed in /
missing server key / offline) and logs details to the console. The old Deno type check is now
`npm run typecheck:functions`. `npm run smoke:routing` does a real anonymous sign-in + route request.

### D15 · Migrations applied through the Supabase MCP connection; local files renamed to match (2026-10-08)

The CLI isn't logged in on the lead machine, so the three migrations were applied with the MCP `apply_migration`
tool, which records its own version numbers. The files in `supabase/migrations/` were renamed to those exact
versions (20261007160713, 20261007160754, 20261007161011) so `supabase db push` / `migration list` agree with the
database. The security advisor reported no issues; the performance advisor's missing foreign-key index on
`routes.public_author_id` was fixed by the third migration. Rules were re-verified on the live project inside a
transaction that always rolls back (nothing left behind: 0 rows, 0 users afterwards).

### D16 · Redesign step 1: city-map-app style, own identity, AA-contrast green (2026-10-16)

Layout and interaction patterns follow mainstream city-map apps (floating search bar, chips, sliding sheets,
5-tab bar with a raised centre action); no third-party names, logos, icons, fonts or assets are used — icons
are MaterialCommunityIcons (open source, bundled in Expo Go). Tokens live in `app/src/theme/` (inside `src/`,
matching the Expo folder convention) and the legacy `Colors`/`useTheme()` now derive from them, so older
screens follow the new palette and the theme setting automatically.
Contrast: the brief's green `#1BA136` gives only 3.4:1 with white text (WCAG AA needs 4.5:1 for normal text),
so `primary` (buttons, selected chips, active tab, links) is `#14822A` (4.9:1) and `#1BA136` is kept as
`accent` for route lines and map graphics (non-text needs 3:1). Dark theme puts dark text on its brighter green
(7.9:1 instead of 2.4:1 for white). `textSecondary` is `#6B7079` (5.0:1 on white) instead of `#8A8F98` (3.4:1).
Tabs: `expo-router/js-tabs` (the plain `Tabs` export is deprecated) because native tabs can't render a raised
custom centre button. Saved/Explore (Routes) and Friends show honest "coming soon" states until steps 4–5;
no demo-mode switch until demo mode exists (Phase 7).

### D17 · Redesign step 2: map layout, light base map, honest route options (2026-10-16)

`@gorhom/bottom-sheet` 5.2 (supports Reanimated 4 / Gesture Handler 2.32, runs in Expo Go) with snap points
15 % / 50 % / 90 %; `GestureHandlerRootView` wraps the app. Light base map: Google Maps (Android) gets a custom
JSON style; Apple Maps (iOS) doesn't support JSON styles in react-native-maps, so it uses `mutedStandard` +
`userInterfaceStyle`. 2D is the default; 3D (tilt + buildings) is a layer toggle. Filter chips map to taxonomy
tags in `shared/src/filters.ts` (step-free requires the `step_free` tag — a lift alone never counts).
Community routes come from `routes_public` (readable signed-out). Route modes other than Fastest say plainly
that no community route covers the trip yet and list the standard route (step-free: "not confirmed") —
real community options arrive with `find-routes` (Phase 4). Errors appear as `ErrorCard`s with Retry.
Floor selector → step 7; follow mode → later.

### D18 · Redesign step 3: place card, route option cards, directions (2026-10-16)

Tapping a landmark, choosing a search-bar result or long-pressing opens a **place card** first (map-app
pattern); picking a place inside From/To still sets it directly. The card shows only what we actually know:
type, nearest MTR exits (straight-line, labelled as such), community routes ending within 100 m, and honest
"no floor info / no photos yet" states — floors come from checkpoints. Save is on-device
(`saved-places-store`); Share sends an OpenStreetMap link (no deep-link infrastructure yet).
The **segment strip** is derived from checkpoint order (`buildSegments` in /shared, tested): entrances toggle
indoor/outdoor; lifts/escalators/stairs/footbridges/underpasses are their own segments. The standard route is
"outdoor" only. `plan-route` now also returns turn-by-turn `steps` (ORS default output; Google via field
mask) — optional in the schema so old/new deployments interoperate; redeployed as version 3 and verified live
(8 steps for Exit A1 → MMW). Directions state clearly that street directions don't know lifts or floors.

### D19 · Redesign step 4: Profile — points on the phone, honest locks, safe delete (2026-10-16)

Levels/points/badges live in `shared/src/levels.ts` (tested: thresholds Newcomer 0 · Explorer 50 · Local Guide
150 · Route Master 400 · Legend 1000; +10 route, +5 description, +5 verified walk, +20 route verified).
Stats are computed **on the phone** from the local SQLite data (uploaded routes, descriptions, lift/entrance
checkpoints, distance) — works offline and for anonymous users; `profiles.points` stays unused until server-side
verification (Phase 5). "Verified by others" is 0 and the Verified Contributor / Top Contributor badges stay
locked (with how-to-earn) until verification and the friends leaderboard exist.
Display name is saved to `profiles.display_name` (column-level update grant). **Not done:** avatar photo upload
(needs a Storage bucket + policies; initials are shown) and the language switch (bilingual pass is Phase 7) —
both rows say so. "Download my data" writes a JSON file (expo-file-system) and opens the share sheet.
"Delete my data" deletes server routes + descriptions with a match-all filter that RLS narrows to the caller —
verified on the live project: another user's delete-all removed 0 rows of someone else's data; the owner's
removed exactly their own route. Server deletion happens first; phone data is only wiped if it succeeds.
The auth user itself can't be deleted from the client (needs an admin key) — it keeps no data afterwards.

### D20 · Redesign step 5: friends — privacy-first, all writes through checked functions (2026-10-16)

Tables `friend_codes` (STROLL-XXXX, no I/O/0/1) and `friendships` (one row per pair, unique on
least/greatest ids; statuses pending/accepted/blocked). Clients can only SELECT their own rows (a block is
visible only to the blocker); every change goes through functions that check `auth.uid()`. Privileged logic
is SECURITY DEFINER in the non-exposed `private` schema; the app calls thin SECURITY INVOKER wrappers in
`public` (pattern recommended by the Supabase security guidance). `authenticated` got USAGE on `private`
for this; all `private` functions have EXECUTE revoked from public/anon except those explicitly granted, and
default privileges now revoke EXECUTE on future `private` functions.
Privacy choices: friend activity shows only routes whose author turned on "show my name"; points/profile of
someone are only returned for ACCEPTED friends; blocked senders get a generic error (they aren't told);
50 pending outgoing requests max (anti code-guessing). Server-side points = +10/route +5/description, the same
rule as `shared/src/levels.ts`. Names fall back to "Walker 7K2Q". Live location sharing, "Show on map" and
"Route to friend" are step 6 and say so. QR encodes `scenicstroll://friend/CODE` (a deep link once the app is
built; in Expo Go people scan or type the code in the app).
Verified: 11 PGlite tests (requests, accept-only-by-addressee, strangers see nothing, profile/leaderboard for
friends only, activity privacy, blocks can't be overwritten or undone by the blocked user) + a live run with
two anonymous accounts. Advisor: no errors; the expected "anonymous access" WARNs (anonymous users are
first-class here) and "leaked password protection" (relevant once email sign-up exists).
