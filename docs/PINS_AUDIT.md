# Knowledge pins — audit (Phase 0)

Written 23 Nov 2026 on branch `knowledge-pins`, before any code changes. Short, factual answers to the team's
questions, with file paths.

## 1. Where do comfort routes work today? Is ORS working?

- **Comfort (computed) routes** — shaded, sheltered, step-free, cool — only work inside the walking-graph box
  around Kowloon Tong MTR, CityU and Festival Walk: lat 22.3297–22.3433, lng 114.1662–114.1808 (about
  1.5 × 1.5 km), `shared/src/graph-area.ts` (`GRAPH_BBOX`, `isInGraphArea`). The graph is the Lands Department 3D
  Pedestrian Network loaded into `public.ped_nodes` / `public.ped_edges` (one active `graph_builds` row).
- **Everywhere else** the app shows only the **standard street route** from openrouteservice (`plan-route`
  function, `supabase/functions/_shared/routing/ors.ts`), and outside the box the planner says computed routes
  aren't available. Driving, taxi and public transport use Google (`plan-trip`).
- **ORS right now:** working — `npm run smoke:routing` on 23 Nov: Exit A1 → MMW, 537 m, 8 directions (ors). It was
  down on 20 Nov for several hours (connection refused); computed routes kept working then.

## 2. What can be reused

| Need                     | Existing code                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Route to this pin"      | Smart routing: `shared/src/router.ts`, `shared/src/routing-profiles.ts`, `shared/src/smart-route.ts`, `supabase/functions/smart-route/`, `supabase/functions/_shared/graph-loader.ts`; app hooks `app/src/lib/smart-routes.ts`, planner `app/src/screens/map/planning-sheet.tsx`. Setting a destination point is all a pin needs.            |
| Place card               | `app/src/screens/map/place-sheet.tsx` (sections: nearest exits, floors, community routes, photos) — add "Pins at this place".                                                                                                                                                                                                                |
| Recorder + GPS filtering | `app/src/lib/recorder.ts` (start/stop, checkpoints), `app/src/lib/watch-position(.web).ts`, `shared/src/gps.ts` (`acceptSample`: accuracy ≤ 30 m, jump filter > 3 m/s, `findGaps` ≥ 20 s, `trimEnds`, `simplify`), review/gaps `app/src/screens/review/index.tsx`, upload `app/src/lib/upload-queue.ts`, `shared/src/route-upload.ts`.       |
| Follow mode              | `app/src/lib/follow-route.ts`, `app/src/screens/map/follow/*` (position feed, off-route re-plan).                                                                                                                                                                                                                                            |
| Badges and levels        | `shared/src/levels.ts` (`LEVELS`, `levelFor`, `badgesFor`), `app/src/screens/profile/badge-tile.tsx`, profile `app/src/screens/profile/index.tsx`.                                                                                                                                                                                           |
| Old points               | Three places use the old rules (+10 route, +5 description, +5 verified walk, +20 verified route): `shared/src/levels.ts` (`POINTS`, `pointsFor`, on the device from local stats), `profiles.points` column (never written by users), and `private.points_since()` in `supabase/migrations/20261015170752_friends.sql` (Friends leaderboard). |
| On-device storage        | `app/src/lib/local-db.ts` (expo-sqlite) and `local-db.web.ts` (IndexedDB) behind one interface — fits the under-18 local collection.                                                                                                                                                                                                         |
| Feedback form            | Already exists (web step 7): `public.feedback` + RLS, `app/src/screens/feedback/`, Profile → Send feedback. Phase 7's form is done.                                                                                                                                                                                                          |
| Moderation / reports     | `review_status` on routes, `route_reports` (D44) — same pattern for pin review.                                                                                                                                                                                                                                                              |
| Security tests           | `supabase/tests/database.test.mjs` — **88** tests now (the brief says 76; 12 were added during the web launch).                                                                                                                                                                                                                              |

## 3. Web: does tracking continue when the screen locks or the tab is in the background?

**No.** What the code does: recording and follow mode call `navigator.geolocation.watchPosition`
(`watch-position.web.ts`) and ask for a screen Wake Lock (`expo-keep-awake`) so the screen doesn't dim by itself.
Nothing handles `visibilitychange`. What browsers allow: when the screen is locked or another tab/app is in front,
**iPhone Safari and Android Chrome stop delivering positions** (they suspend the page); the Wake Lock only stops the
screen from turning off _automatically_, not a manual lock, and is released when the tab is hidden. When the page
comes back, positions resume; the recorder sees no accepted point for ≥ 20 s and the review screen shows a **gap**
(`findGaps`), where the walker can add a checkpoint. Nothing is lost before or after the gap, but the time in between
is not recorded. Phase 6 adds the "Recording paused, tap to resume" message.

**Manual test (iPhone Safari, then Android Chrome):**

1. Open the site outdoors, allow location, start recording (today: Record tab → Start recording).
2. Walk ~1 minute with the page open: distance goes up, "GPS good".
3. Lock the phone, keep walking ~1 minute, unlock: note whether the distance jumped forward or stayed.
4. Switch to another app for ~1 minute while walking, come back: same check.
5. Stop → Review: the map should show a gap for steps 3–4 (expected), and the line before/after should be intact.

## 4. Can a friend follow a shared recorded route step by step?

**No.** Follow mode (`useFollow().start`) only takes a computed route or the standard street route
(`app/src/screens/map/index.tsx`, `startFollowing`). Community routes are drawn on the map with their checkpoints
(`selectCommunityRoute` only fits the map to them), there's no turn-by-turn for them, and there's no way to share a
recording with one friend — routes become public after review (D44).

## 5. What map data can a pin attach to?

- **Pedestrian-network nodes** (`public.ped_nodes`): street points, lifts, escalators, stair ends, MTR exits,
  building entrances — **only inside the Kowloon Tong box**, and their ids are **per graph build**
  (`build_id`, `id`), so they change when the graph is rebuilt.
- **OSM places:** there is **no OSM places table**. Places come from openrouteservice's geocoder (Pelias, built on
  OSM) at search time, and the 19 preset landmarks are hard-coded (`shared/src/presets.ts`). ORS has a _reverse_
  geocoder (`/geocode/reverse` around a point) that returns nearby OSM venues with their ids — that's how the expert
  form can snap to an OSM place within 25 m without storing all of OSM.
- **Other:** community routes and their checkpoints, path reports, MTR station data (`shared/src/transit`).
- **Recommendation:** the pin's **`location` point is always the truth**; `place_ref` only says what it is attached
  to: `{ kind: 'ped_node', build_id, node_id }`, `{ kind: 'osm', osm_id }` (e.g. `node/123`), or
  `{ kind: 'custom', description }`. For a tree or a boundary stone, use **custom**: the expert drops the pin
  exactly (tap/long-press, then drag), writes a required short description ("granite boundary stone at the foot of
  the steps, east side of Kent Road"), and later a photo. A rebuilt graph or a deleted OSM node never moves the pin.

## 6. Anything that would block the plan

Nothing blocks building it; these need a decision or an account, and the plan below works around them:

1. **No LLM key.** The repo plans Gemini (`GEMINI_API_KEY`, docs/SETUP.md §7) but no function calls an LLM yet, and
   the secret isn't set. I'll build `generate-pin-versions` on Gemini with the key in a header and a zod-checked
   answer, tested with a fake model; it returns a clear error until `GEMINI_API_KEY` is set.
2. **Experts and admins need real accounts.** Everyone signs in anonymously today; an anonymous account can't be used
   on another device or recovered. I'll add **email one-time-code sign-in** for `/admin` only (no redirect URLs
   needed). Supabase's built-in email sender allows only a few emails per hour — fine for a handful of experts.
3. **Admins** don't exist as a concept yet: a new `admins` table, filled by SQL in the dashboard (like approving
   routes today).
4. **Distance points need walks on the server.** Uploading a recording today _publishes_ it as a community route. For
   points I'll add a private, owner-only walk table (adults only, never for under-18s) and compute points from it on
   the server; sharing as a community route stays a separate choice. The privacy policy draft must mention it.
5. **"Invite-only":** nothing restricts who can open the link today. I'll treat it as "the link is shared privately";
   tell me if you want an invite-code gate.
6. **Map clustering:** MapLibre (web) can cluster, react-native-maps can't. I'll cluster with one small shared
   function, so the web and phone maps behave the same.
7. **Capacity and limits** (docs/LAUNCH_CHECKLIST.md): the free database handles ~5 computed routes at once; EAS/Vercel
   request limits; keys pasted in chat still to rotate.
