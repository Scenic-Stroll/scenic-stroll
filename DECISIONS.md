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
