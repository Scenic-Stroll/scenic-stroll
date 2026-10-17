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

### D21 · Redesign step 6: live location sharing — opt-in, foreground, enforced by the database (2026-10-16)

`location_shares` (one row per user) + `location_share_recipients`. RLS lets you read a share only if you are an
ACCEPTED friend, it hasn't expired, it was updated in the last 30 minutes (a killed app can't leave a dot
behind, even with "until I stop"), and — when the sharer picked people — you're on their list. Recipients can
only be accepted friends (insert policy). No SECURITY DEFINER needed: the viewer can already see their own
friendship rows, so the policy checks friendships directly. Approximate mode rounds to a 0.002° (~200 m) grid
**on the phone** before sending, and a trigger snaps again before storing (defence in depth); the trigger also
keeps shares inside Hong Kong. Updates every ~15 s via `watchPositionAsync` while the app is open; no
background tracking; on launch any leftover share from a closed session is deleted. Default precision is
approximate. Friends' maps refresh through Supabase Realtime (`location_shares` added to the
`supabase_realtime` publication; RLS decides who receives changes) with a 30 s polling fallback.
Verified: 9 PGlite tests (strangers, selected-only, non-friend recipients rejected, expiry, staleness, block/
remove stop visibility, can't write others' rows, HK-only, snapping) + a live run (stranger saw 0, friend got a
Realtime event, stop removed it). A follow-up migration replaced the "Walker ????" fallback name with one
derived from the user id and indexed `friendships.requester_id` (performance advisor).

### D22 · Redesign step 7: floor selector from real checkpoints; dark theme polish (2026-10-16)

Floor selector: appears when the map is zoomed in (< ~400 m span) with its centre within 150 m of Festival Walk
or a CityU building. Floors are **derived from community checkpoints near the building** (`checkpoints_near`,
an INVOKER read of already-public data, radius capped at 500 m, flagged/retired routes excluded) — we don't
have verified floor lists, so none are invented; with no data it shows "No floor info here yet". Floor names
are normalised and sorted the Hong Kong way (B2 < B1 < LG2 < LG1 < G < UG < L1 … ; 1/F style understood) in
`shared/src/floors.ts` (tested). Picking a floor shows only checkpoints on that floor (a lift G→L2 is on both).
Dark theme: removed every hard-coded colour from the pre-redesign screens (Record, Review, My routes,
checkpoint sheet, route trace, diagnostics). New tokens: `trace`, `onDanger`, and tinted
`success/warning/danger/infoSurface`; `warning` darkened to #B35C00 (4.7:1 on white). Status rows (GPS quality,
upload state) are now tinted backgrounds with normal text and coloured icons instead of white text on saturated
colours (the old orange GPS row was 2.8:1). Only `shadowColor: '#000'` remains, intentionally.

### D23 · Smart routing step 1: live conditions from the Hong Kong Observatory (2026-10-16)

**Data sources checked (2026-10-16):**

- HKO open data API `weather.php?dataType=rhrread` (current weather) and `dataType=warnsum` (warnings in force):
  both answered live, JSON, no key. DATA.GOV.HK terms (read 2026-10-16): free for commercial and non-commercial use if we name the source, acknowledge the Government / HKO ownership and attribute DATA.GOV.HK → "© Hong Kong Observatory, HKSAR Government · via DATA.GOV.HK" in Profile → About, plus "Hong Kong Observatory" on the "Now" card. Shapes we rely on: `temperature/humidity/rainfall.data[]` by place; `uvindex` is `""`
  at night and an object by day; rainfall `max` is missing when a gauge is under maintenance; `warnsum` is `{}`
  with no warnings, else keyed objects with `code` (`WHOT`, `WRAINA/R/B`, `WTS`, `TC1/3/8NE…/9/10`) and
  `actionCode` (`CANCEL` ignored). Parsing is lenient (zod) and anything else is treated as "HKO down".
- Sun position: `suncalc` 1.9.0 (BSD-2-Clause, © Vladimir Agafonkin), computed locally. Pinned to 1.9.0 with
  `@types/suncalc` rather than the 2.x line released this month, to avoid a brand-new major days before the
  deadline. In Deno it is mapped per function in `deno.json`; `sun.ts` carries a `@ts-types` hint for Deno.
- Not used: HKO rain nowcast / 9-day forecast ("high rain probability") — optional in the brief; the
  Thunderstorm Warning (`WTS`) stands in for "rain likely" for now.

**Location:** temperature from the Kowloon City station (then Sham Shui Po, then the Observatory); rainfall =
highest of the Kowloon City and Sham Shui Po districts (CityU sits on their border); UV is HKO's single King's
Park reading; the sun is computed at the demo centre (`CONDITIONS_POINT`, kept equal to `DEMO_CENTER` by a test,
not imported, so the function bundle doesn't pull in the presets/taxonomy).

**Mode rules** (`deriveConditionMode`, tested), in priority order: `typhoon_or_black_rain` (Signal 8+ or Black
Rainstorm) > `rain` (rain in the past hour, or Amber/Red/Black rainstorm or Thunderstorm warning) > `heat`
(≥ 31 °C, UV ≥ 6 or Very Hot Weather Warning — **daytime only**, there's no sun to hide from at night) > `night`
(sun below the horizon) > `normal`. Signal 1/3 alone stays normal (warnings are still listed on the card).

**Caching instead of a scheduler:** the function fetches on request but reuses `public.conditions_cache` while it
is fresh (current weather 10 min, warnings 5 min — HKO updates hourly). If HKO fails it serves the cached
answer up to 6 h old (`source: 'cache'`, `stale: true`), else time-of-day defaults (`source: 'defaults'`).
A garbage HKO answer is never cached. The orchestration (`getConditions`) is plain code with injected
fetch/cache, so every fallback is unit-tested without the network. No pg_cron job is needed for the demo.
The cache table has RLS on, **no policies and no grants** for anon/authenticated (only the function's service
role touches it) — the advisor's INFO "RLS enabled, no policy" for it is intentional.

**App:** the "Now" card (top of route planning) shows facts, the English + Traditional Chinese headline, warnings
in force and where the data came from ("updated 4 min ago" / "offline, last report …" / "Live weather
unavailable" / "Simulated"). The weather picks the starting tab until the user taps one (rain/severe →
Sheltered, heat → Shaded, else Fastest); tapping the card lets the user set the priority (session only).
If the function can't be reached the phone computes day/night itself, so the card never errors.
**Simulate weather** (Profile → Diagnostics) is for the pitch; not saved, so it can't be left on by accident.
**Bilingual:** the app has no language switch yet (deferred in redesign step 4), so new strings follow the
existing "English · 中文" side-by-side pattern; a real switch remains a separate task.
`agoLabel` moved from `location-sharing.ts` to `shared/format.ts` (now tested) so both features use it.
Live check: cold call 6.5 s (function boot), cached call 0.6 s; signed-out call → 401.

### D24 · Smart routing step 2: walking graph from the Lands Department 3D Pedestrian Network (2026-10-16)

**Source (checked 2026-10-16):** the 3D Pedestrian Network (3DPN), CSDI dataset `landsd_rcd_1637222018065_52265`,
queried from its public ArcGIS MapServer (`portal.csdi.gov.hk/server/rest/services/common/…/MapServer`, layer 0
`PedestrianRoute` + tables `AccessTime`, `AccessTimeDetails`, `PedRouteRelFloorPoly`), JSON with heights
(`returnZ`), WGS84 (`outSR=4326`), paged 2,000 rows. Listed on DATA.GOV.HK, so the DATA.GOV.HK terms apply (free
use, name the source, acknowledge the Government) → "3D Pedestrian Network © Lands Department, HKSAR Government ·
via CSDI / DATA.GOV.HK" in Profile → About. It loaded in about a minute, so the OSM fallback wasn't needed.

**Area:** `GRAPH_BBOX` (≈1.5 × 1.5 km around Kowloon Tong MTR / Festival Walk / CityU, `shared/src/graph-area.ts`),
downloaded with a **300 m margin**: cut exactly at the box, edge streets (Beacon Heights, Broadcast Drive, Sai Yeung
Choi St N.) became 15 disconnected scraps (93 % connected); with the margin the main piece holds 99.2 % of nodes.
Routing stays inside `GRAPH_BBOX`; the margin is only there so paths near the edge keep their links.

**Attribute mapping** (`edgeAttributesFrom3dpn`, tested): `FeatureType` → kind (footbridge, subway, escalator,
lift, ramp, stairs/stairlift, crossings; other footways → `footway` or `indoor_corridor` when `Location` = indoor);
covered = `WeatherProof` covered, or indoor, or subway; **air_conditioned = indoor (estimate)** — 3DPN has no AC
field; indoor links here are malls, the station and campus buildings; flagged as an estimate for the UI. 3DPN's
`WheelchairAccess` field is "False" even for lifts (6,376 of 6,507 segments), so it is **not used**; step-free comes
from the type plus `WheelchairBarrier` (which marks 285/286 staircases and 28/29 escalators): stairs, escalators
and barriers → "no", stairlift → "unknown", the rest → "yes". `Gradient` is rise/run → `slope_pct`. One-way
escalators (`Direction` ±1) are stored pointing the allowed way. Crossing waits are estimates (signalised 45 s,
zebra 5 s, cautionary 10 s). Opening hours → OSM-style text ("Mo-Su 07:00-24:00" for Festival Walk); CLOSE rows
(lift maintenance windows) become "… off". Skipped: disabled segments, proposals, MTR paid areas (none in our box).
Confidence 0.9 for field-checked data, 0.8 otherwise, −0.2 when the position is uncertain.

**Topology:** segments are joined only at their **ends**, never where lines cross on the map (a footbridge over a
road crosses the road without connecting), in two passes: ends at the same point (5 cm, same height) first, then
**loose ends only** snap to a node within 1.5 m and 2 m of height. A first version snapped every end at 1.5 m and
collapsed 863 short segments, including 20 short staircases, which step-free routing would have walked over.
Node kinds come from the edges that meet (lift / escalator / stairs top/bottom); a node where indoor meets outdoor is
a door (`building_entrance`, `is_entrance`); the node nearest each MTR exit preset (≤ 25 m, main piece) is
`mrt_exit` — all 9 matched. Components are computed in the script (union-find) and only the main piece is loaded;
`pgr_createTopology` isn't needed (the script assigns source/target), and pgRouting is enabled in step 3 where it is
used. **No manual seed links were needed:** Festival Walk LG1 ↔ the Tat Chee Avenue subway ↔ CityU and every MTR exit
are in the main piece. A quick shortest-path check: Exit A1 → MMW 575 m via Festival Walk LG1 and the subway (ORS
street route: 537 m); Exit C1 → YEUNG 338 m, 91 % covered.
**Known gap:** 3DPN models almost no lifts _inside_ CityU buildings (one, at the student hostels), so the node nearest
a building's centre can be behind steps (AC2: nearest node 24 m, nearest step-free-reachable node 46 m). Step 3 must
snap to the nearest node that is reachable for the chosen mode; community routes are the way to fill this gap.

**Loading:** the CLI isn't logged in on the build laptop and we have no service-role key locally, so the graph is
uploaded through `graph_begin / graph_add / graph_activate` (public INVOKER wrappers → private SECURITY DEFINER,
signed-in callers only) that each demand a **loader key**: `npm run graph:key` makes a random 32-byte key and prints
the SQL to register its **SHA-256 hash** with a 24 h expiry (built-in `sha256()`, no extension). Writes are atomic per
build: a build loads as 'loading', `graph_activate` checks it isn't empty, retires the old active build and deletes
its rows (one active build enforced by a partial unique index). Everyone may read the three tables (open data);
nobody can write them directly. Build 1 is live: 9,372 nodes, 10,730 edges, 154 km of paths (21 km covered),
uploaded in 12 s. The data date (Hong Kong time) is shown in Profile → Diagnostics → Walk map.

### D25 · Smart routing step 3: `smart-route` — our own computed routes (2026-10-16)

**Routing in TypeScript, not pgRouting.** The brief suggested pgRouting (available, 3.4.1). We route with a small
Dijkstra in `shared/src/router.ts` instead, because the cost depends on things that are awkward in SQL and easy in
code: opening hours **at the time you'd reach each edge** (departure + walking time so far), one-way escalators,
the conservative step-free rule, per-profile weights, and "find a different route" penalties for step 5. Being in
`/shared` it is the same code in the Edge Function, the unit tests and `npm run graph:try` (and the step 8 eval) —
readable for first-year maintainers and testable without a database. Still deterministic: no language model
touches a route. pgRouting stays unused for now.

**Costs** (`shared/src/routing-profiles.ts`, the one place to tune): time = length / 1.3 m/s (0.9 m/s on stairs and
slopes > 8 %, escalators 3D length / 0.6 m/s, lifts 40 s + 10 s per 3.5 m floor, crossings + their wait), times
multipliers per profile: sun/rain on uncovered edges, a capped air-conditioning bonus (never below ×0.3), slope
above 5 %, community confidence (none yet). Step-free: "no" edges impossible, "unknown" ×3. In step 3 "shaded"
treats covered/indoor as shade (step 4 adds building shadows). "Best now" per condition: rain/severe → sheltered,
heat → cool, night → fastest (no lighting data), normal → balanced. Detour cap 1.4× fastest → "Much longer".

**Start/end ("access") handling** — two real bugs found by tests and the live data:

1. The router may connect the start to several nearby nodes (so a building whose nearest node is behind steps
   can still be reached step-free via the ramp 40 m away). First version allowed any node within 250 m with a
   cheap straight-line walk, and the search **"teleported" past parts of the trip** (through buildings, past
   stairs). Now only nodes within **60 m of the nearest one** are candidates, and the unmapped straight walk costs
   ×3, so mapped paths win. If every candidate is indoor-only (a point inside Festival Walk at 2 am) the nearest
   outdoor nodes are added, else there'd be no route.
2. The database keeps the build script's node ids, which have gaps (scraps were left out); the router indexed
   arrays by id and crashed live. `prepareGraph` now renumbers ids itself (tested with gapped ids).
   Step-free verdict: any "no" edge → no; any "unknown" edge or an unmapped access walk > 60 m → **unconfirmed**; only
   then "yes". Access walks ≤ 60 m are treated as "where you tapped vs the door", not as a path.

**Per-request partial graph instead of a cached whole graph.** Hosted Edge Functions shut the worker down after
(almost) every request (logs: "shutdown" after each call), so an in-memory cache of the 10,730-edge graph was
re-loaded every time (1.1–3.2 s). `walking_graph_export(min_lng, min_lat, max_lng, max_lat)` now returns only the
edges in a box around the trip + 400 m (GiST index; ~2,500–5,200 edges, **141 ms** in the database) as compact
arrays with precision-6 encoded polylines. Checked on 24 trip × profile combinations: identical routes to the
full graph. Server time per request is now ~0.9–2.2 s (several profiles routed); from a laptop 1.3–1.8 s when the
app sends the condition (it does — the "Now" card's mode, so routes match the card and the HKO lookup is skipped).
A further saving (skip the graph load for points outside the area) goes into the next deploy.

**App:** computed options are listed first (requested profile, then Best now, then fastest; > 80 % overlap merged
into one card with several roles), each labelled **"Computed"** with % covered, step-free / unconfirmed / stairs,
lifts, "Much longer"; the selected one shows the template explanation ("Mostly covered: 82% under cover or indoors,
through Festival Walk LG1. About as quick as the fastest route.") plus "air-conditioning is estimated … not yet
confirmed by walkers", and our own directions ("Take the escalator up (Festival Walk)", "Go through the subway (Tat
Chee Avenue)"). The standard street route stays as a baseline card. Any failure, `outside_area` (with a note),
`no_route` or `no_graph` → only the standard route, silently. There is no `find-routes` function yet (Phase 4), so
"merge community matches" happens there later; `smart-route` already returns the roles and overlap logic it needs.
Example (13:00, rain, Exit C1 → YEUNG): sheltered 372 m / 82 % covered vs fastest 375 m / 78 %; heat → cool route
425 m / 87 % covered / 53 % indoor; at 02:00 Festival Walk (07:00–24:00) is avoided.

### D26 · Smart routing step 4: building and tree shade (2026-10-17)

**Data (checked 2026-10-16):** Lands Department **Building** dataset on CSDI
(`landsd_rcd_1637211194312_35158`, ArcGIS MapServer, DATA.GOV.HK terms — same attribution as the walking network):
footprints with `BaseHeight` / `TopHeight` in metres above sea level (mPD). 3,324 active buildings in the area +
margin. Footprints without heights (311, mostly "Open-sided Structure": covered walkways, shelters) are treated as
**canopies** — shade right underneath only. Trees from OpenStreetMap via Overpass (241 trees, 21 tree rows, 63 woods;
ODbL, already credited); Overpass rejects requests without a descriptive User-Agent (HTTP 406), so the script sends one.

**Height above the street, not above sea level.** A shadow on the pavement comes from the roof's height above the
pavement. Ground level = the nearest street-level node of our walking graph within 60 m (3DPN heights are mPD too),
else `BaseHeight`. Without this, a CityU hall on the hill (top 127.5 mPD) would have cast a 127 m-tall shadow.

**Geometry** (`shared/src/shadows.ts`, no libraries, tested with a synthetic 30 m block: exactly 30 m of shadow at
45°, 52 m at 30°, west in the morning, none at night): shadow = convex hull of the footprint and the footprint moved
`height / tan(altitude)` away from the sun, capped at 250 m. Over-shades L-shaped buildings slightly — fine for an
estimate the app labels "estimated". Tree crowns: 4 m circles (rows: a 3 m crown every 5 m), woods as polygons.
Each edge is sampled every 2 m; covered/indoor edges are 100 %. Elevated footbridges are treated as if at street
level (2D) — a known simplification.

**One day, every 30 minutes, reused ~2 weeks.** The brief suggested a table row per edge per time bucket for today +
2 days (~800,000 rows). Instead each edge stores 25 numbers (07:00–19:00) in `ped_edges.shade_pct`, with
`graph_builds.shade_date` — the sun's path moves < 0.4° a day in October, so one day's shade is good for about two
weeks; recompute the day before the pitch. Computing takes ~1 s on a laptop; uploading uses the same one-day
loader key (`graph_set_shade`, only for loading/active builds). Typical result for 16 Oct: open-air paths are
42 % shaded at 09:00 and 15:00, 28 % at 13:00 (high sun), 71 % at 17:00.

**Routing:** `exposed = 1 − shade` at the moment you'd reach the edge (nearest half hour), times **sun strength**
(`sin(altitude) / sin 45°`, capped at 1, 0 at night), times the profile's sun weight. Unknown shade counts as half
exposed (neutral), as the brief asks. At night shade drops out entirely (no "% shaded" is claimed after dark).
Live check: Exit A1 → MMW at 13:00, heat: the cool route is 73 % shaded vs 56 % for the fastest (2 min longer);
Exit A1 → AC2 at 10:00: shaded route 55 % vs 45 %, and no stairs instead of three.

**Response additions:** `pct_shaded` (null after dark), `exposure` metres (sun / shade / covered / indoor /
"open" = outdoors with no sun or unknown, incl. the unmapped access walks), `runs` (index ranges into the line with a
style) and `markers` (stairs, lifts, escalators); the explanation adds "About 73% in shade or under cover at
13:00 (estimated)." **App:** exposure bar on every computed card, "% shaded" badge, the selected route drawn in
stretches (sun orange, shade green, covered blue, indoor purple, dashed grey where unknown) with red dots at stairs
and icons at lifts, a "What do the map colours mean?" legend, and "estimated shade, based on building heights, trees
and the sun's position" under the explanation. Diagnostics → Shade shows the day shade is for.

**Lesson:** adding the export's 23rd field broke the already-deployed `smart-route` (strict zod tuple) until it was
redeployed a few minutes later — the app fell back to the standard route meanwhile, as designed. Tuples now accept
extra trailing fields (`.rest`), so a newer database can't break an older function again. The function also skips
loading the graph for trips outside the area now (0.3 s instead of ~1 s).

### D27 · Smart routing step 5: mode tabs, departure time, alternatives (2026-10-17)

**Tabs:** Best now · Fastest · Shaded · Sheltered · Cool · Step-free, a horizontally scrolling chip row
(`app/src/screens/map/route-mode-tabs.tsx`). **Best now is the default** and maps to the profile for the current
condition (`PROFILE_FOR_CONDITION`: normal → balanced, rain/severe → sheltered, heat → cool, night → fastest), so the
weather still picks the route but the user always sees _which_ profile that is. Changing the "Now" card condition
jumps back to Best now; closing planning resets tab and departure time.

**Departure time:** chips Leave now / In 15 min / In 30 min / In 1 h / At… (`departure-picker.tsx`); "At…" opens
`@react-native-community/datetimepicker` 9.1.0 (bundled in Expo Go, added with `npx expo install`). A past time of
day means tomorrow. The time goes to `smart-route` as `departure_time`, so shade (nearest half hour) and opening hours
(at the time you reach each link) are for then; a caption says so. "Now" sends nothing (server time).

**Alternatives — penalty method, not k-shortest paths.** After the requested / best-now / fastest routes are picked
and merged, one more search for the requested profile runs with every edge already used costing ×1.5. It is offered
as "· another way" only if it shares at most 80 % of its length with every offered route (either direction) and takes
at most 1.4× the fastest time; max 4 options. Why: Yen's k-shortest returns near-identical routes that differ by one
kerb; the penalty search finds a genuinely different street in one extra Dijkstra (~50 ms). On the local graph it
found an alternative in 22 of 30 demo runs. Live check (A1 → MMW, 13:00 heat): cool 9 min 81 % shaded, alternative
10 min 81 % shaded via another street.

### D28 · Smart routing step 6: re-routing while walking (2026-10-17)

**Follow mode came first.** Phase 4's follow mode didn't exist yet, so step 6 adds a small one: "Start walking" on
the chosen computed or standard route. The bottom sheet shows the current and next instruction, time left, distance
left and arrival time. All rules are plain functions in `shared/src/follow.ts` (unit-tested); the app's
`follow-engine.tsx` only wires GPS, Realtime and the conditions into them. Checkpoint instructions for community
routes stay in Phase 4.

**Off route** = more than 40 m from the line for 20 s (the brief's numbers), then re-plan from the current position
with the same profile; a countdown shows meanwhile. **GPS fixes worse than ±50 m are ignored.** Why: inside Festival
Walk or an MTR concourse the phone can be 100 m out, and a re-plan every 20 s indoors would be worse than none. After
a re-plan (or a failed one) the 20 s start again, so a phone outside Hong Kong doesn't hammer the server.

**Weather change.** The conditions query already refreshes every 5 min. When its mode changes while walking (live
weather, the "Now" card or the demo switch), we ask smart-route for the best route for the new condition _from where
you are_. Then we show either "It's started raining — a sheltered route via Festival Walk LG1 adds 2 min. Switch?"
or "you're already on the best route for it" (> 80 % of its edges are yours). We never switch without asking.

**Blocked paths: a new `path_reports` table, not the spec's per-route `reports`.** The spec's reports flag a whole
community route; re-routing needs to know _which path_ is blocked. "Report blocked path ahead" sends the point
30 m ahead on your route. `report_blocked_path()` snaps it to the nearest edge of the active graph (≤ 30 m) and keeps
it 3 hours; a second report on the same path extends it. Each person gets 10 reports per hour. Reports are
**anonymous**: the public table has no user column, and the reporter sits in `private.path_report_authors` (only for
the rate limit and "Clear my reports"). smart-route reads active reports with the trip graph and treats those edges as
impassable. Followers get new reports through Realtime and re-plan if the edge is on the part of their route still
ahead. Computed routes now include `edge_ids`; for the standard route we fall back to "within 15 m of the line". The
planning sheet says when routes avoid reported paths. Realtime sends PostGIS points as GeoJSON (checked live), not
EWKB, hence `pointFromPostgis()`. Lesson: without a way to undo, one demo run would block a real path for 3 hours, so
there is "Undo report" and Diagnostics → "Clear my blocked-path reports" (only reports nobody else confirmed).

**Closing indoor links.** The router already never uses a link that is closed when you'd reach it. The new case is a
link that closes **less than 20 min after** you'd reach it. Each such link gets a warning on the card and in the
explanation ("Festival Walk LG1 closes at 00:00 — you'd pass at 23:50"), and the alternative slot goes to a route
around it. Routing around one Festival Walk floor often leads through another with the same hours, so the planner
repeats up to 4 times, blocking each newly found closing link. If no clear way exists, there's no alternative, only
the warning (e.g. starting inside Festival Walk). If an offered route is already clear, it's marked "Avoids a closing
indoor link" instead of being listed twice. While walking, if you won't reach a closing link at walking speed with
2 min to spare, follow mode re-plans once. `closesAt()` parses the hours once and the summary only looks 20 min
ahead, so this adds no measurable time (the 30 demo runs on the local graph are all still ≤ 30 ms).

**Demo:** Diagnostics → "Simulate walk" moves a pretend walker along the route at 4× walking speed instead of GPS.
The follow panel then offers "Step off route" (the walker stands 60 m to the side), "Make it rain" and "Make it hot",
so every re-routing case can be shown on stage. Live check (A1 → MMW, rain): a report in the middle of the sheltered
route arrived by Realtime in < 1 s; the next plan avoided the edge (14 → 23 min, that path is a key link) and showed
`blocked_paths: 1`; "Clear my reports" restored the 14-min route.

Small fix found on the way: `cleanName()` turned floor codes into "Festival Walk Ug"; floor codes and
abbreviations (UG, LG, GF, MTR…) now stay in capitals.

### D29 · Smart routing step 7: walkers' feedback and "Save as a community route" (2026-10-17)

**One question, matched to the promise.** At the end of a computed walk, the question depends on what the route promised:
sheltered → "Was this route sheltered as promised?", shaded/cool → "Was it shaded as promised?", step-free → "Was it
really step-free?", others → "Was the route as described?". Answers are 👍 / Partly / 👎. One tap, so people
actually answer. The standard street route makes no promises, so it gets no question.

**Votes per path, one per person.** The answer counts as a vote on the walk's _relevant_ paths: shelter → covered or
indoor paths; shade → open-air paths; step-free → paths not already known to have steps; overall → all. The server
picks the relevant paths itself. A walk with re-plans counts the earlier routes' edges too, estimated by the share of
distance walked (edge lengths aren't on the phone; votes are averaged over many walkers anyway).
`private.edge_votes` keeps one vote per person, path and aspect, so a later answer replaces an earlier one and one
person can't push a path around alone. `public.edge_feedback` holds only the counts. Voters are never readable, the
counts are anonymous and public, and each person can answer 20 walks an hour. **Demo walks are recorded but never
counted**, so a pitch rehearsal can't change real routing.

**How feedback changes routing — deliberately small and slow** (`shared/src/edge-feedback.ts`):

- _Score_ = (👍 − 👎) / (votes + 2), from −1 to 1. It replaces the old "community × confidence" term in the cost, using
  the score for the promise the route makes (a sheltered route uses shelter votes). The profiles' existing community
  weight of 0.2 caps the effect at ±20 %; fastest ignores it.
- _Dispute_: once ≥ 3 people say no (Partly counts half), and at least twice as many as say yes, the map is treated as
  wrong. A "covered" path counts as not covered (indoors stays indoors), shade becomes unknown, and "step-free" becomes
  unconfirmed. **Feedback never upgrades anything to step-free**: that promise stays with the map data (the
  conservative rule from step 3). The explanation says so: "Walkers corrected the map for N parts of this route", and
  `data_sources` gains `walker_feedback`.
- The brief said to lower or raise each edge's `confidence`. The score per promise does that job more precisely: a
  path can be well covered but badly shaded. `ped_edges.confidence` stays what the source data says.

**Feedback travels inside the graph export (field 23)**, not as a separate read: it arrives already filtered to the
trip's box in the same call, and a plain API read silently stops at 1,000 rows. Older functions ignore the extra field
(their tuples accept trailing fields, see D26). Since the export can run signed out, the anonymous counts are readable
by anon too.

**Save as a community route.** After arriving, the walk can be saved through the existing `create_route` with the
new `routes.origin = 'planned'` (default `'recorded'` for GPS recordings). The line is the planned path actually walked,
including the parts before any re-plan; stairs, lifts and escalators become checkpoints. It starts unverified like
every route, and the list labels it "Planned, then walked" so nobody mistakes it for a GPS recording. There's no
privacy trim (it isn't a GPS trace), but it does start where you started; the form says so and the walker chooses.
The id is made once per form, so a double tap can't save twice.

**Live check:** three test users each answered 👎 on the sheltered A1 → MMW route. 15 of its 17 covered paths were
overruled (the 2 indoor ones stayed), covered dropped from 43 % to 25 %, the planner chose a different route and the
explanation said "Walkers corrected the map for 15 parts of this route". A saved planned route showed up for another
user as `origin: planned, status: unverified`. All test data was then removed.

**Known limits:** if someone deletes their account, their votes go but the counts aren't recalculated until that path
gets another vote. A trigger can fix that when "delete my data" (Phase 7) lands. The MCP `apply_migration` call kept
failing for the export migration ("Invalid or expired requestState"), so it was applied in one transaction with
`execute_sql` and recorded in `supabase_migrations.schema_migrations` by hand (version 20261016205000).

### D30 · Smart routing step 8: shade layer, evaluation, demo safety (2026-10-18)

**"Shade now" layer** (Layers menu). Every outdoor path is coloured by estimated shade at the current half hour:
sun < 35 %, part shade 35–70 %, shade ≥ 70 %, plus covered walkways. Indoor paths and lifts are left out (no sky).
`shade_layer()` merges neighbouring paths of the same class into long lines on the server (`ST_LineMerge`). Why:
react-native-maps draws one native line per path, and the whole area has ~9,000 paths. Merged and without < 10 m
scraps it is 1,937 lines for the whole area and ~600 (20 KB) for a screen, with 93 % of the length kept (measured
live). The app only asks while zoomed in, for a box snapped to a 500 m grid (small pans reuse what it has), and caps
drawing at 1,500 lines. After dark it shows 13:00 and says so ("No sun now — showing 13:00 for reference").

**Evaluation** (`npm run eval:routing`, brief §9) → `eval/results/routing-2026-10-24.md`. It covers 5 demo trips at
10:00 / 13:00 / 17:00, in heat and in rain, on the local copy of the live graph build. 66 checks all pass: the
coolest route is at least as shaded as the fastest, the sheltered route at least as covered, step-free routes have
no stairs or escalators, the "much longer" flag matches the 1.4× cap, and each plan takes < 2 s (slowest 28 ms
locally). The headline counts only trips where the weather route actually differs. In the other 7 the fastest route
already _is_ the best one (often through Festival Walk), and averaging those zeros in would hide the trade-off.
**Heat: a different route in 8 of 15 trips, there a median +1 min for 48 % less time in the sun (best case 81 %).
Rain: 9 of 15, median under a minute for 29 % less uncovered walking.**

**Demo safety** (brief §10). `npm run demo:snapshot -- <day>` saves the live answers for the demo trips (both
directions, normal / rain / heat, the "Best now" tab, 13:00 on the pitch day) into `app/src/demo/smart-route-snapshot.json`
(30 answers, 530 KB, bundled). `useSmartRoutes` uses one **only when the live call fails** and the trip starts and
ends within 40 m of the demo places. The planning sheet then says "Offline — showing routes saved for the demo
(…13:00 on 2026-10-24)", so a saved answer is never shown as live. Saved answers pass the same zod check as live
ones, so an outdated file can't show a broken route. It isn't Prettier-formatted (one line, on purpose), and the
"Simulate weather" switch from step 1 still works offline.

**Shade recomputed for the pitch day.** Live shade is now for 2026-10-24 (was 16 Oct; the sun's path moves
~0.4° a day). The eval and the snapshot were rerun on it, with almost the same results.

**Diagnostics** gained "Test smart routing" (Exit A1 → MMW: options, seconds, map build, shade day). The profile's
attribution adds "Shade estimates: building heights © Lands Department · trees © OpenStreetMap contributors".

**Measured live latency** (from the dev machine, 8 calls): first 2.1 s, then a median of 1.4 s (0.6–1.5 s).

**Not done in smart routing** (see PLAN.md → Definition of done): merging computed routes with community routes
needs `find-routes` (Phase 4), and the smart-routing screens are English only (the bilingual pass is Phase 7).

### D31 · Multimodal step 1: walk vs car in one comparison (2026-10-18)

**Scope change.** The interim report said "pedestrians only". The multimodal brief adds car, taxi and public transport
— **as a comparison and nudge layer, not a new core.** Walking stays the default tab and comes first, every option
shows the same facts (time, cost or "unavailable", CO₂ estimate, walking minutes, sun/rain exposure, step-free), and
a walk or transit option within 5 minutes of driving is marked _recommended_ with the time and CO₂ comparison
("Only 3 min slower than driving · saves ~329 g CO₂"). Driving is never the default.

**One shape for every mode** (`shared/src/trip-schema.ts`, zod): a TripOption has legs (walk / car / later transit
and taxi) with geometry, instructions, traffic segments and a realtime flag, plus labels (fastest, cheapest,
greenest, least walking, most sheltered, step-free, avoids traffic). `trip-plan.ts` turns each mode's result into
options and ranks them. The default "best for you" sort is time, plus 0.2 s per gram of CO₂ (1 km by car ≈ 33 s),
2 min per transfer, and in rain or heat half a second per exposed walking second (unknown counts as half exposed,
like the walking router). The user can also sort by Fastest / Cheapest / Greenest / Least walking.

**`plan-trip` Edge Function.** Walk and car run in parallel, each with a 4 s limit and its own fallback. A mode
that fails is listed in `unavailable`, never as an error, and the app keeps the walking tab whatever happens.

- _Walk_ asks our `smart-route` function, passing the user's own token, so walking logic lives in one place: shade,
  cover, step-free, blocked paths and walkers' feedback all carry over. Outside the walking graph it uses the
  standard street walk.
- _Car_: **Google Routes API** `computeRoutes`, `travelMode=DRIVE`, `routingPreference=TRAFFIC_AWARE`,
  `computeAlternativeRoutes=true`, `extraComputations=[TRAFFIC_ON_POLYLINE]`, with a minimal field mask. It returns
  the time with traffic (`duration`), the typical time (`staticDuration`) and NORMAL / SLOW / TRAFFIC_JAM per
  stretch (checked against Google's docs 2026-10-18). We use `TRAFFIC_AWARE` rather than `_OPTIMAL` because Google
  documents alternatives with it and it answers faster; traffic-aware requests are billed at a higher rate. Google
  refuses departure times in the past, so "now" is sent without one.
- _Fallback_: OpenRouteService `driving-car` with up to 2 alternatives. It has no live traffic, so every card says
  "Typical traffic — live traffic isn't available right now", and `estimated` includes `traffic`.
- _Avoids traffic_: when two live car routes differ by ≥ 2 min, the quicker one is labelled ("Avoids traffic: saves
  6 min vs the route via …").
- **Live check:** it works; the first call took 6.4 s (cold start), later calls ~1.8 s and 0.5 s from the cache.
  **`GOOGLE_ROUTES_API_KEY` is not set** on the project yet (the health check says `ors-typical-traffic`), so live
  traffic switches on as soon as the team adds a key with billing (PLAN.md team need #8).

**Cost control** (brief §7). `public.api_cache` keys requests by mode, start/end rounded to ±50 m and a 5-minute
time bucket: Google answers are reused for 3 min, ORS for 10. `public.api_calls` logs every paid call, and Google
stops at a daily cap (secret `GOOGLE_DAILY_CAP`, default 300; resets at Hong Kong midnight) before falling back to
ORS. ORS is capped at 1,500 a day (its free tier is 2,000). Both tables are server-only (RLS on, no grants, like the
weather cache). Field masks keep each Google call in the cheapest tier that has what we need.

**Data model (brief §2), only what this step uses.** `transit_stops`, `transit_eta_cache`, `traffic_cache` and
`trip_plans` come with the steps that need them. Emission factors live in code (`shared/src/emissions.ts`, with
sources) rather than a table: they change maybe once a year, and code review is where a number like that should be
checked.

**CO₂** (estimates, labelled): car 164.5 g CO₂e per vehicle-km, "Petrol car (average)", UK DESNZ/BEIS GHG
Conversion Factors 2024 (Hong Kong publishes no per-km factor; most private cars here are petrol), counted for one
person. Walking 0. Car cost shows "Cost unavailable": fuel, parking and tolls vary too much to guess.

**App.** The planning sheet has Walk · All · Car tabs, each with its best time. Walk keeps everything from smart
routing. All and Car show comparison cards: big time, arrival, distance, cost, CO₂, walking minutes, a leg strip
with a dot for live data, labels, the green nudge, and the traffic delay or the "typical traffic" note. On the map
the chosen car route is coloured by traffic (green / orange / red), or dashed grey when traffic isn't live. Tap
another line to choose it. Profile → About credits Google Maps Platform and openrouteservice/OSM for driving.

**Deployment note:** the `plan-trip` bundle was deployed with trimmed copies of `conditions.ts` and
`routing-profiles.ts` containing only what it imports at run time (`ConditionModeSchema`, `PROFILE_FOR_CONDITION`,
`PROFILE_LABELS`), to keep the bundle small. The repo has the full files; a CLI deploy would ship those.

### D32 · Multimodal step 2: public transport — Google transit + our own MTR planner (2026-10-18)

**Two sources, one shape.** `plan-trip` asks Google Routes `TRANSIT` first (`_shared/transit-google.ts`, field
mask limited to steps, transit details and fare; cached 5 min, same daily cap as driving). Without a key, or if
Google fails, it falls back to **our own MTR planner** (`shared/src/transit/`). Both produce a `TransitPlan`, which
`transitTripFromPlan` turns into the same `TripOption` cards as walking and driving. The Google path is tested
against a recorded response (2 Deno tests) but has **not run live**: `GOOGLE_ROUTES_API_KEY` is still not set
(PLAN.md team need #8).

**Why our own MTR planner instead of "transit unavailable".** Without a key there is no free transit router for
Hong Kong we can call from an Edge Function (ORS and OSRM have no public transport; OpenTripPlanner needs a
server we'd have to host). The MTR network is small and public, so a planner fits in ~200 lines:

- **Data:** `mtr_lines_and_stations.csv` (MTR Corporation, via DATA.GOV.HK — free to reuse with attribution,
  DATA.GOV.HK terms of use) gives the lines, branches and station order. It has no coordinates, so station
  positions come from OpenStreetMap (station nodes/stop areas via Overpass; ODbL, credited in About). North Point
  and Yau Tong were missing from the OSM match and were added by hand. `npm run transit:build` regenerates
  `mtr-data.ts` (12 line branches, 100 stations, ~11 KB) and refuses neighbours more than 12 km apart (20 km for
  the Airport Express and Tung Chung Line) to catch a bad match.
- **Search:** Dijkstra over (station, line) states. Ride time = 40 s dwell + distance ÷ 18 m/s per hop; first wait
  150 s; change of line 240 s; the two long walkways (Central ↔ Hong Kong, TST ↔ East TST) 360 s; 120 s to get in
  or out of a station. Starts and ends: the 3 nearest stations within 1.5 km, walked at 1.3 m/s with a 1.25 detour
  factor. A plan that isn't quicker than walking straight there is dropped (CityU → Festival Walk no longer
  suggests the train). These are rough averages, not checked against MTR's timetables (e.g. CityU → Mong Kok
  comes out at ~21 min door to door); they are **labelled estimates** until step 3 brings live times.
- **Fares:** `mtr_lines_fares.csv` (same source, adult Octopus column). At ~123 KB it would bloat the function, so
  it lives in `public.mtr_fares` (server-only: RLS on, no grants). `plan-trip` fills the table from MTR's CSV the
  first time it finds it empty. If that fails the card says "Fare unavailable" rather than guessing.

**Labels, never pretending.** Every transit card from our planner says "Train times estimated from distance (MTR
open data) — not live"; Google's says "Scheduled times — not live" until step 3 adds real-time ETAs. Walks to and
from stations are straight-line estimates ("Walks to and from stations are estimates") **unless** both ends are
inside our walking graph: then `plan-trip` asks `smart-route` for each walking leg (2 best options only, to keep
the request quick) and `withWalkLegs` swaps in the real route, times and steps. Sun and cover figures appear only
when _every_ walking leg is ours; a half-known trip would otherwise look "most sheltered" on the strength of its
first 300 m.

**CO₂ per passenger-km** (estimates, labelled): rail 55 g — low end of the 55–71 g range from MTR's sustainability
reports and Aston University's MTR study, since most demo trips are on busy urban lines; bus 130 g — UK DESNZ
2024 "local bus (not London)", the closest published factor (Hong Kong publishes none per passenger-km).

**App.** A Transit tab joins Walk · All · Car. Transit cards show the line names as chips in each line's colour,
the fare ("HK$5.9 (Octopus)"), waiting time and changes. On the map, ride legs are drawn in the line colour with
board/alight markers. Profile → About credits MTR / DATA.GOV.HK and OpenStreetMap.

**Latency.** Warm requests take 2.4–3.7 s with all three modes; the first after a quiet spell takes 6.5–7 s (cold
start of both `plan-trip` and `smart-route`, plus the walking-leg calls). That is over the brief's 4 s target when
cold; the app shows the walking option first from its own route call, so the screen isn't empty meanwhile.

**Deployment note:** as in D31, the deployed bundle uses trimmed copies of `schemas.ts`, `api.ts`, `presets.ts`,
`conditions.ts` and `routing-profiles.ts` (only what runs). `sync-shared` now copies sub-folders (`transit/`).
