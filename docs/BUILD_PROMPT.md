# Build prompt: Scenic Stroll — community-sourced pedestrian navigation (Hong Kong)

> Source of truth for the prototype. Progress lives in `PLAN.md`; deviations are recorded in `DECISIONS.md`.

---

## 0. Your role and how to work

You are the lead engineer building a working **mobile prototype** for a hackathon team of mostly first-year CS students. Hard deadlines:

- **Oct 10–11, 2026:** team walks real routes at CityU with the app → route logging MUST work on real phones by then.
- **Oct 18, 2026:** final submission (prototype + pitch deck + 1-min demo video).
- **Oct 24, 2026:** live pitch/demo at CityU.

Working rules:

1. **Plan first.** Before writing code, create `PLAN.md` with the phases below as a checklist, and `DECISIONS.md` to record any choice you make that this prompt doesn't fix. Update both as you go.
2. **Build in phases, in order.** Each phase must end in something runnable on a phone via Expo Go. Do not start a later phase while an earlier one is broken.
3. **Prefer boring, free-tier tech.** Everything must run on free tiers or a few dollars of API credit.
4. **Never put secret keys in the app bundle.** LLM and server keys live only in backend environment variables.
5. **Write small, readable code** with comments — teammates who are new to React Native will maintain it.
6. **After each phase:** run type checks, lint and tests, update `PLAN.md`, and print a short "how to test this on your phone" note.
7. If something in this prompt is impossible or a free tier is unavailable, stop, explain, propose the closest alternative, and log it in `DECISIONS.md`.

---

## 1. Product summary

Map apps in Hong Kong follow the street grid. They miss the routes locals actually use (mall corridors, footbridges, underpasses, covered walkways, lifts), give vague directions ("go up 32 metres"), omit floor levels, and sometimes route people into fences or non-existent roads. This hurts most on the **last mile** (MTR exit → destination), especially for newcomers and people who need **step-free** routes.

**Scenic Stroll** is a layer on top of a standard map:

1. Users **log a walking route** (GPS trace + optional checkpoints like "took lift to L2") and **describe it in their own words** (English, Cantonese or mixed).
2. **GenAI converts the description into structured tags** from a fixed vocabulary (lift, sheltered, shaded, air-conditioned, stairs, step-free, etc.).
3. Other users **search and follow** these community routes, filtered by what they need (fastest / sheltered / shaded / step-free).
4. While walking, users get **pop-ups** about tagged places and nearby community events.
5. Routes start **unverified** and become **verified** when other users repeat them.

**Critical design principle:** the LLM only does text → structured tags (and short summaries). **It never computes coordinates, distances or routes.** All geometry and routing are handled by map code and PostGIS.

**Demo area:** City University of Hong Kong (CityU) campus, Kowloon Tong MTR station, and Festival Walk mall. Approximate centre: `22.3365, 114.1735` (verify these coordinates on the map before hard-coding).

**Out of scope:** replacing Google Maps' routing engine, indoor positioning hardware/beacons, driving/cycling/transit, city-wide coverage, carbon leaderboard, friend groups.

---

## 2. Tech stack (fixed unless impossible)

| Layer                       | Choice                                                                                                                                                                                        | Why                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| App                         | **Expo (React Native) + TypeScript**, Expo Router                                                                                                                                             | Runs on iOS and Android via Expo Go; fastest path for a student team                 |
| Map display                 | `react-native-maps`                                                                                                                                                                           | Works in Expo Go                                                                     |
| Location                    | `expo-location` (foreground only for the prototype)                                                                                                                                           | Simple permissions                                                                   |
| State / data fetching       | TanStack Query + Zustand                                                                                                                                                                      | Small, well documented                                                               |
| Validation                  | `zod` (shared schemas between app and backend)                                                                                                                                                | One source of truth                                                                  |
| Backend                     | **Supabase**: Postgres + **PostGIS**, Auth (anonymous + email), Edge Functions, Storage                                                                                                       | Free tier, spatial queries built in                                                  |
| Standard pedestrian routing | **Provider interface** with two implementations: Google Routes API (walking) and OpenRouteService `foot-walking`                                                                              | Swappable; ORS is free fallback                                                      |
| LLM                         | **Provider interface** in the Edge Function. Default: **Gemini (free tier)**. Also implement DeepSeek and an OpenAI-compatible adapter (covers OpenRouter). Select via env var `LLM_PROVIDER` | Team hasn't settled on a model; switching must be a config change, not a code change |
| Tests                       | Vitest (shared logic), Deno tests (Edge Functions)                                                                                                                                            |                                                                                      |

Repo layout (monorepo):

```
/app                 Expo app
/supabase
  /migrations        SQL (PostGIS schema, RLS policies, functions)
  /functions         Edge Functions (tag-route, plan-route, verify-walk, ...)
  /seed              Seed data for CityU demo area
/shared              zod schemas, tag taxonomy, geometry helpers (used by app + functions)
/eval                AI tagging evaluation set + script
/docs                Setup guide, architecture diagram, demo script
```

---

## 3. Data model (PostGIS)

Create migrations for these tables (add sensible indexes, including GIST on all geometry columns):

- **profiles** — `id` (= auth user), `display_name` (nullable), `is_anonymous_default` bool, `points` int, `created_at`.
- **routes** — `id`, `created_by`, `show_author` bool, `title`, `geom` (LineString, SRID 4326, simplified), `start_point`, `end_point` (Point), `start_label`, `end_label`, `distance_m`, `duration_s` (measured), `status` (`unverified` | `verified` | `flagged` | `retired`), `verified_at`, `last_confirmed_at`, `created_at`.
- **route_checkpoints** — `route_id`, `seq`, `point`, `kind` (`lift` | `escalator` | `stairs` | `entrance` | `footbridge` | `underpass` | `note`), `floor_from`, `floor_to`, `note`. This is how floor-level information gets captured, since GPS indoors is poor.
- **route_descriptions** — `id`, `route_id`, `author_id`, `text`, `detected_lang`, `created_at`. A route can have many descriptions from different users.
- **route_tags** — `route_id`, `description_id`, `tag` (must be in the taxonomy), `value` (e.g. `true` / `partial`), `confidence` (0–1), `evidence` (exact substring quoted from the description). Aggregated tag view per route counts how many descriptions support each tag.
- **route_summaries** — `route_id`, `summary_en`, `summary_zh`, `updated_at` (LLM-generated from all descriptions).
- **walks** — a user following or re-walking a route: `id`, `route_id`, `user_id`, `geom`, `match_score`, `completed` bool, `created_at`. Used for verification.
- **reports** — `route_id`, `user_id`, `reason` (`blocked` | `closed_hours` | `wrong` | `unsafe` | `spam` | `other`), `note`, `created_at`.
- **places** — community points for pop-ups: `id`, `point`, `radius_m`, `title`, `body`, `tags`, `created_by`, `created_at`.
- **events** — `id`, `point`, `title`, `starts_at`, `ends_at`, `source`.
- **badges** + **user_badges**.

**Row Level Security:** enable on every table. Anyone can read routes/tags/places; only authenticated users (including anonymous auth) can insert; users can edit/delete only their own content. Never expose `created_by` when `show_author = false` — use a view.

---

## 4. Tag taxonomy (fixed vocabulary, lives in `/shared/taxonomy.ts`)

```
access:     lift, escalator, stairs, ramp, step_free
shelter:    covered, indoor, air_conditioned, unsheltered
shade:      shaded, partly_shaded, sunny
elevation:  flat, uphill, downhill, steep
structure:  mall_route, footbridge, underpass, through_building
experience: scenic, quiet, crowded, food_nearby, green_space, heritage
caution:    long_wait_crossing, narrow, closes_at_night, construction
```

Each tag has: English label, Traditional Chinese label, icon, and a filter group. The LLM may ONLY output tags from this list.

---

## 5. Phases

### Phase 0 — Setup (target: day 1)

- Monorepo scaffold, Expo app, Supabase project config, `.env.example` files, ESLint/Prettier, TypeScript strict.
- `docs/SETUP.md`: step-by-step for a beginner on Windows and macOS — install Node, Expo Go on phone, Supabase CLI, how to get each API key, how to run locally, how to deploy Edge Functions.
- Anonymous sign-in on first launch; optional upgrade to email account later.

### Phase 1 — Base map and standard routing

- Map screen centred on the demo area, showing user location.
- Search/select origin and destination: free text via the routing provider's geocoder, **plus a preset list** of demo landmarks (Kowloon Tong MTR exits, Festival Walk entrances, CityU gates and main buildings). Store presets in `/supabase/seed`.
- Edge Function `plan-route`: calls the routing provider and returns a standard walking route (polyline, distance, duration). Keys stay server-side.
- Draw the standard route in grey.

### Phase 2 — Route logging ⚠️ must be solid before Oct 10

- "Record route" flow: start → live trace on map → stop → review.
- GPS handling:
  - Sample every 2–3 s; discard points with accuracy worse than 30 m and impossible jumps (speed > 3 m/s for walking).
  - Simplify with Douglas–Peucker (~3 m tolerance) before upload.
  - Detect gaps (indoors / underground) and draw them dashed; ask the user to add a checkpoint for each gap.
- **Checkpoint button** during recording: one tap to drop "lift / escalator / stairs / entrance / footbridge / underpass / note" at the current position, with optional floor from/to.
- After stopping: title, start/end labels (snap to nearest preset if within 60 m), free-text description (placeholder examples in English and Cantonese), "show my name" toggle.
- **Offline-safe:** save the recording locally first (expo-sqlite or AsyncStorage) and upload when online, with a visible "pending upload" queue. Mall basements and MTR stations have bad signal; no recording may be lost.
- **Privacy:** before upload, offer to trim the first/last 50 m; never store raw unsimplified traces on the server.
- "My routes" list with edit/delete.
- Hidden **"Data collection mode"** (toggle in settings) for the team's Oct 10–11 session: bigger buttons, auto-numbered titles, quick re-record.

### Phase 3 — AI tagging

- Edge Function `tag-route`, triggered on each new description:
  1. Load description text + the route's checkpoints (as text, e.g. "checkpoint 2: lift, floor G→L2") — **no coordinates are sent to the LLM.**
  2. Call the LLM with a JSON schema / structured output. Output shape:
     ```json
     {
       "detected_lang": "en | zh-HK | mixed",
       "tags": [
         { "tag": "lift", "value": "true", "confidence": 0.9, "evidence": "take the lift up to L2" }
       ],
       "summary_en": "…",
       "summary_zh": "…"
     }
     ```
  3. **Validate with zod.** Drop any tag not in the taxonomy. Drop any tag whose `evidence` is not an exact substring of the description or a checkpoint text. Retry once on invalid JSON, then save what is valid.
  4. **Accessibility guardrail:** `step_free` may only be emitted when the text explicitly supports it (e.g. "no stairs", "lift all the way", "wheelchair OK"). If the route has any `stairs` checkpoint, `step_free` is forbidden. Mentioning a lift is not enough for `step_free`.
  5. Recompute the route's aggregated tags and regenerate `route_summaries` from all descriptions.
- System prompt for the LLM lives in `/supabase/functions/tag-route/prompt.ts`, includes the taxonomy, rules above, and 4–6 few-shot examples (at least two Cantonese/mixed, e.g. "由港鐵C出口行入又一城，搭𨋢上L2，全程有冷氣").
- Show tags as chips on the route card; tapping a chip shows the evidence quote.
- Cost control: cache by description hash, cap tokens, log provider/model/tokens per call to a `llm_calls` table, and add a simple daily call limit.
- **Evaluation (`/eval`)**: a JSON file of 10 sample descriptions (English, Cantonese, mixed) with hand-assigned tags, and a script `npm run eval` that calls `tag-route` logic for each configured provider and prints: per-tag precision/recall, overall agreement (target ≥ 70%), and **count of unsupported step-free tags (target 0)**. Results saved as Markdown in `/eval/results/` for the pitch deck.

### Phase 4 — Finding and following routes

- Edge Function `find-routes(origin, destination, preferences)`:
  - **Full match:** community routes whose start is within 150 m of origin and end within 150 m of destination (PostGIS `ST_DWithin`, using geography).
  - **Partial match (A→B known, user wants A→D):** find community routes that start near origin OR end near destination, then **stitch**: standard walk to the community route's start + community segment + standard walk from its end. Only offer a stitched route if its total duration is ≤ 1.3× the standard route (configurable). Label it "Partly community route".
  - **Cold start fallback:** if nothing matches, return only the standard route and show "No community routes here yet — be the first to log one".
  - Ranking by preferences (`fastest`, `sheltered`, `shaded`, `step_free`): hard-filter on `step_free` when selected; otherwise score = duration penalty + tag bonuses, with verified routes ranked above unverified.
- UI: results sheet comparing standard vs community options side by side (time, distance, key tag chips, verified badge, last confirmed date, number of contributors). Draw community routes in colour, checkpoints as icons with floor info.
- **Follow mode:** turn-by-turn-lite using checkpoints and descriptions ("At Festival Walk entrance, take the lift to L2"), off-route warning when > 40 m from the line for > 20 s.
- Preference presets including a **weather toggle**: "Rainy day" → prefer covered/indoor; "Hot day" → prefer shaded/air-conditioned.

### Phase 5 — Verification, incentives and moderation

- Edge Function `verify-walk`: when a user completes follow mode or records a route similar to an existing one, compute geometric similarity in PostGIS (buffer the route by 25 m; match if ≥ 80% of the walk lies inside the buffer and the Hausdorff distance is under a threshold). Store `match_score`.
- A route becomes **verified** after **2 matching completed walks by distinct users other than the author** (configurable). Each match updates `last_confirmed_at`.
- Show "Last confirmed X days ago"; routes not confirmed for 180 days are marked stale; 3+ open reports set status to `flagged` and hide it from default results.
- Points and badges (inspired by Google Local Guides/Yelp): +10 log a route, +5 description, +5 verified walk, +20 when your route becomes verified. Badges: First Route, Shelter Scout, Lift Finder, Verified Contributor, Top Contributor (weekly). Profile screen showing points, badges and contributions; anonymous users keep points on their device account.
- Report button on every route.

### Phase 6 — On-route pop-ups

- `places` near the active route: when the user comes within `radius_m`, show a small non-blocking card ("Festival Walk L2 bridge — air-conditioned shortcut to CityU", "Open day at CityU today").
- Users can add a place with a short text; run the same tagging function on place text.
- "Before you go" suggestions: on the route results screen, list up to 3 places/detours within 100 m of the chosen route.
- Seed 8–12 real places and 1–2 sample events in the demo area.

### Phase 7 — Demo readiness

- **Seed script** that loads the team's real routes collected on Oct 10–11 (export/import JSON), plus at least three MTR → CityU routes: fastest outdoor, sheltered through Festival Walk, and a step-free option if one exists.
- **Demo mode** (settings toggle): fixed origin/destination presets, a "simulate walk" button that animates a dot along a route (so the pitch works indoors without GPS), and pre-loaded pop-ups.
- Bilingual UI: English default, Traditional Chinese toggle for all labels and tags.
- Accessibility: large tap targets, screen-reader labels, sufficient contrast, step-free filter prominent.
- Error states everywhere (no GPS, no network, LLM failure → route still saves, tags marked "pending").
- `docs/DEMO_SCRIPT.md`: a 60-second walkthrough matching the demo video (problem on standard map → community sheltered route with tags → AI tagging from a Cantonese description live → verified badge → pop-up).
- `docs/ARCHITECTURE.md` with a Mermaid diagram (app → Supabase → routing provider / LLM provider) for the pitch deck.

### Stretch (only if Phases 0–7 are done)

- Spike: assess the Lands Department **3D Pedestrian Network** dataset (via the CSDI portal / data.gov.hk) — check licence, format and whether its floor/lift data for the demo area can be shown as an overlay or used to seed cold-start routes. Write findings in `DECISIONS.md` before building anything.
- Export a route as a shareable link.
- Simple admin web page to review flagged routes.

---

## 6. Non-functional requirements

- **Privacy (Hong Kong PDPO):** collect the minimum; anonymous by default; clear consent screen explaining what location data is stored and why; delete-my-data button that removes the user's routes, walks and descriptions.
- **Security:** RLS on all tables; Edge Functions validate input with zod; rate-limit writes per user; no API keys in the client except a restricted maps display key if required.
- **Cost:** all LLM and routing calls go through Edge Functions with logging and daily caps; document expected cost per 1,000 tagged descriptions per provider in `DECISIONS.md`.
- **Performance:** map interactions stay smooth with 200 routes in view; spatial queries use GIST indexes.
- **Testing:** unit tests for GPS filtering, simplification, stitching logic, ranking, tag validation (taxonomy + evidence substring + step-free guardrail) and verification matching. One end-to-end happy-path test script documented in `docs/`.

---

## 7. Definition of done (check before Oct 18)

- [ ] Fresh install on an iPhone and an Android phone via Expo Go works using `docs/SETUP.md` alone.
- [ ] A team member can record a route at CityU with checkpoints, describe it in Cantonese, and see validated tags within ~10 s.
- [ ] Searching Kowloon Tong MTR → a CityU building shows the standard route and ≥ 3 community routes with tags and verification status.
- [ ] Step-free filter never shows a route containing stairs.
- [ ] A partial-overlap trip returns a stitched route or a clear standard-route fallback.
- [ ] A route becomes verified after two other users walk it.
- [ ] Pop-ups appear in follow mode and in simulated demo mode.
- [ ] `npm run eval` reports ≥ 70% agreement and 0 unsupported step-free tags, with results saved.
- [ ] Switching `LLM_PROVIDER` between Gemini and one other provider works without code changes.
- [ ] Demo script, architecture diagram and eval results are ready for the pitch deck.
