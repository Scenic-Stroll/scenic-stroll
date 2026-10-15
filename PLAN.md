# Scenic Stroll — Build Plan

Deadlines: **Oct 10–11** data-collection walk (Phase 2 must work on phones) · **Oct 18** submission · **Oct 24** live pitch.
Today: Oct 7. Rule: each phase ends runnable in Expo Go; never start a phase while the previous is broken.
After every phase: `npm run typecheck && npm run lint && npm test`, tick boxes here, write a "test on your phone" note.

Legend: `[ ]` todo · `[x]` done · `[~]` blocked on team input (see "Needed from the team")

---

## Needed from the team

| #   | What                                                                               | Where to get it                                                              | Blocks               |
| --- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------- |
| 1   | Supabase project **URL** + **publishable key** (`sb_publishable_…`)                | supabase.com → New project (region: Singapore) → Project Settings → API Keys | Phase 0 sign-in test |
| 2   | Supabase **project ref** + **database password** (for `supabase link` / `db push`) | Same project; password chosen at creation                                    | Applying migrations  |
| 3   | Enable **Anonymous sign-ins**                                                      | Dashboard → Authentication → Sign In / Providers                             | Phase 0              |
| 4   | **Gemini API key** (free tier)                                                     | aistudio.google.com → Get API key                                            | Phase 3              |
| 5   | **OpenRouteService key** (free) — and optionally a Google Routes API key           | openrouteservice.org/dev → Sign up → Tokens                                  | Phase 1              |
| 6   | Optional: DeepSeek / OpenRouter key for the second LLM provider                    | platform.deepseek.com / openrouter.ai                                        | Phase 3 eval         |
| 7   | Everyone: update **Expo Go** to the latest version (SDK 57)                        | App Store / Play Store                                                       | All phones           |

Secrets are never committed and never go in the app — only into `supabase secrets set …` (server) or local `.env` files that are git-ignored.

---

## Phase 0 — Setup (target Oct 7)

- [x] Git repo, `.gitignore`, npm workspaces monorepo (`app`, `shared`; `eval` joins in Phase 3)
- [x] `app/`: Expo SDK 57 + TypeScript strict + Expo Router (`src/app` routes-only layout)
- [x] `shared/`: tag taxonomy (`taxonomy.ts`, icons verified), zod schemas, Vitest (geometry helpers come with Phase 2)
- [x] `supabase/`: `supabase init` (anonymous sign-ins on), first migration (PostGIS + `profiles` + auto-create profile trigger + RLS + GRANTs) — syntax-checked, **not yet applied** (needs project, see table above). Functions import map → Phase 1
- [x] ESLint (expo config) + Prettier, root scripts: `typecheck`, `lint`, `test`, `format`
- [x] `app/.env.example` (functions env example comes with the first function in Phase 1)
- [x] Supabase client in app (session persisted in AsyncStorage) + anonymous sign-in on first launch
- [x] Placeholder tabs: Map · Record · My routes · Settings
- [x] `docs/SETUP.md` (Windows + macOS beginner guide)
- [x] Verify: typecheck, lint, tests green; iOS + Android bundles export
- [~] On-phone check: Settings shows "Anonymous account" — needs Supabase project (items 1–3)
- [ ] Email-account upgrade → moved to Phase 5 profile screen (spec says "later")

## Phase 1 — Base map & standard routing (target Oct 8)

- [ ] Full schema migration (all tables §3, GIST indexes, RLS, GRANTs, `routes_public` view hiding `created_by`)
- [x] Demo presets from OpenStreetMap: 11 Kowloon Tong exits, Festival Walk, 7 CityU buildings (`shared/src/presets.ts`). Festival Walk entrances + CityU gates → add after Oct 10 walk
- [x] Map screen centred on demo area (centre verified), user location, long-press to drop a destination
- [x] Origin/destination picker: landmarks (EN/中 filter), My location, free-text search via `geocode` function
- [x] Routing provider interface: ORS `foot-walking` + Google Routes; `ROUTING_PROVIDER` secret — 5 Deno tests with faked responses
- [x] Edge Functions `plan-route` + `geocode` (zod in/out, keys server-side) → grey polyline + time/distance card
- [x] `plan-route` + `geocode` deployed (2026-10-07); `npm run check:functions` guards names + deployment; Settings → Diagnostics
- [x] Server verified end-to-end (2026-10-08): anonymous sign-in on, `ORS_API_KEY` set, `npm run smoke:routing` → Exit A1 → MMW 537 m / 6 min; real API upload → read → delete OK
- [ ] Confirm on a phone (iPhone + Android)

## Phase 2 — Route logging ⚠️ must be solid by Oct 10

- [x] GPS pipeline in `shared/src/gps.ts`: accuracy filter (>30 m), speed filter (>3 m/s), gap detection (>20 s), 50 m trim, Douglas–Peucker 3 m — 19 unit tests
- [x] Upload payload (`shared/src/route-upload.ts`): raw trace never leaves the phone; checkpoints in trimmed ends dropped — 7 unit tests
- [x] Recording screen: start → live trace (gaps dashed) → stop; sample every 2.5 s; screen kept awake; GPS quality line
- [x] Checkpoint buttons (7 kinds) + floor sheet (G, L1, L2… or custom); tap a checkpoint on the map to remove it
- [x] Review screen: title (auto-suggested), start/end labels snapped to landmarks ≤ 60 m, description (EN + 粵語 placeholders), show-my-name, trim 50 m, add a checkpoint at each GPS gap, live "what will be shared" preview
- [x] Offline-first: every GPS point saved to SQLite as it arrives; app killed mid-walk → recovered as a draft; upload queue retries on launch / foreground / reconnect / "Upload now"
- [x] My routes: drafts, waiting-to-upload (with reason), uploaded; edit + delete (also on the server)
- [x] Data collection mode (Settings): bigger buttons, auto-numbered titles, "Save & record another", no trim by default
- [x] Database: `routes`, `route_checkpoints`, `route_descriptions`, `routes_public` view, `create_route()` (one transaction, idempotent, HK-only, 60/hour) — 20 security tests on local Postgres + PostGIS (`npm run test:db`)
- [x] Migrations applied to Supabase (2026-10-08): `init_profiles`, `routes`, `index_routes_public_author`; security advisor clean; 10 live checks passed in a rolled-back transaction
- [ ] Field test on 1 iPhone + 1 Android around CityU before Oct 10

## Phase 3 — AI tagging (target Oct 12–13)

- [ ] LLM provider interface: Gemini (default), DeepSeek, OpenAI-compatible (OpenRouter); `LLM_PROVIDER` env
- [ ] `tag-route` function + `prompt.ts` (taxonomy, rules, 4–6 few-shots incl. ≥2 Cantonese/mixed)
- [ ] Validation in `shared`: zod, taxonomy filter, evidence-substring check, step-free guardrail — **unit tested**
- [ ] Retry once on bad JSON; aggregate tags; regenerate summaries
- [ ] Cost control: description-hash cache, token cap, `llm_calls` log, daily limit
- [ ] Tag chips on route card; tap → evidence quote
- [ ] `/eval`: 10 labelled descriptions + `npm run eval` → precision/recall, agreement ≥ 70%, 0 unsupported step-free; Markdown to `eval/results/`

## Phase 4 — Find & follow (target Oct 14–15)

- [ ] `find-routes`: full match (150 m ST_DWithin geography), partial match + stitching (≤ 1.3× standard), cold-start fallback
- [ ] Ranking (`fastest`/`sheltered`/`shaded`/`step_free` hard filter, verified first) — **unit tested**
- [ ] Results sheet: standard vs community side by side
- [ ] Community routes coloured; checkpoint icons with floors
- [ ] Follow mode: checkpoint instructions, off-route warning (> 40 m for > 20 s)
- [ ] Weather presets (Rainy day / Hot day)

## Phase 5 — Verification, incentives, moderation (target Oct 16)

- [ ] `verify-walk`: 25 m buffer, ≥ 80 % inside, Hausdorff threshold → `match_score` — **unit tested**
- [ ] Verified after 2 distinct non-author matching walks; `last_confirmed_at`; stale after 180 d
- [ ] Reports (3+ → flagged, hidden by default); report button
- [ ] Points + badges; profile screen

## Phase 6 — On-route pop-ups (target Oct 16–17)

- [ ] Proximity pop-up cards in follow mode
- [ ] Add-a-place (tagged with same function)
- [ ] "Before you go" (≤ 3 places within 100 m)
- [ ] Seed 8–12 real places + 1–2 events

## Phase 7 — Demo readiness (target Oct 17–18)

- [ ] Import team's Oct 10–11 routes (JSON export/import) + ≥ 3 MTR → CityU routes
- [ ] Demo mode: fixed presets, simulate-walk animation, pre-loaded pop-ups
- [ ] Bilingual UI (EN / 繁中) for all labels and tags
- [ ] Accessibility pass (tap targets, screen-reader labels, contrast)
- [ ] Error states (no GPS / no network / LLM failure → tags "pending")
- [ ] Consent screen + delete-my-data (PDPO)
- [ ] `docs/DEMO_SCRIPT.md`, `docs/ARCHITECTURE.md` (Mermaid), e2e happy-path doc
- [ ] Definition-of-done checklist (§7) walked through on real phones

## Stretch

- [ ] 3D Pedestrian Network spike (findings in DECISIONS.md first)
- [ ] Shareable route link
- [ ] Admin page for flagged routes
