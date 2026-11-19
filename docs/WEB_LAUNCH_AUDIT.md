# Web launch audit (step 1)

Checked against the code on 2026-11-19, on branch `upgrade-sdk-58` (Expo SDK 58, React Native 0.88). Nothing has been changed yet: this
is the plan for review. A test web build (`npx expo export -p web`) was run to find real breakages, not
guessed ones.

## 0. Three things to decide before step 2

1. **Merge the SDK 58 upgrade first.**
   - All web work should be built on SDK 58: it's what current Expo Go runs, and it already opens on an iPhone.
   - Today it lives only on the `upgrade-sdk-58` branch; `main` is still SDK 57.
2. **Hosting: Vercel's free plan doesn't fit.**
   - Vercel's Hobby plan is for **personal, non-commercial use only**. Our pitch describes a business model (partner fees), so a public Scenic Stroll site counts as commercial use and could be suspended.
   - **Proposal: EAS Hosting**, Expo's own host for `expo export -p web`, with preview URLs per deploy. Its current free-tier limits need confirming before step 6.
   - **Alternative:** Netlify or Cloudflare Pages; both free plans allow commercial use. Vercel only on the Pro plan.
3. **Supabase free plan: the backend pauses after 7 days without activity.**
   - This happened on 11 Nov; the app showed "check your internet connection".
   - For a public link, that means the site silently breaks during any quiet week.
   - **Option A:** Pro plan, US$25/month, which never pauses.
   - **Option B:** stay free and accept the risk, with an uptime check that emails us. A scheduled "keep-alive" ping would also work, but it works around Supabase's policy, so it's the team's call.

## 1. Libraries: do they work on web?

| Library                                                                                                                     | Where it's used                                                                       | Works on web?                                                                | Plan                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react-native-maps`                                                                                                         | 9 files: map, record, review, route trace, shade layer, trip/route lines, follow mode | **No** (no web support)                                                      | `MapView.web.tsx` with **MapLibre GL JS + OpenFreeMap tiles** (free, no key, no usage limits). Keep the same props we use: `Marker`, `Polyline` (coloured, dashed, tappable, zIndex), `onLongPress`, `onRegionChangeComplete`, `fitToCoordinates`, `animateCamera`, `showsUserLocation`, dark/light style |
| ↳ `showsTraffic` (traffic layer)                                                                                            | map                                                                                   | **No** — MapLibre has no traffic data                                        | **Hide the Traffic layer on web.** Google's JS map has one, but needs a billed key and costs per map load. Incidents layer still works                                                                                                                                                                    |
| `expo-location`                                                                                                             | 6 files                                                                               | Partly: current position + watch work over HTTPS; no background              | Use as is; add a "location denied → pick a start point or landmark" path (step 2)                                                                                                                                                                                                                         |
| `expo-sqlite` (offline recordings)                                                                                          | `lib/local-db.ts`                                                                     | **Breaks the web build today** (`user_version` error during export)          | `local-db.web.ts` on **IndexedDB** (`idb-keyval`), same interface                                                                                                                                                                                                                                         |
| `expo-keep-awake`                                                                                                           | recorder                                                                              | Yes (Wake Lock API, Chrome/Safari 16.4+)                                     | Use; no-op where unsupported                                                                                                                                                                                                                                                                              |
| `expo-camera` (QR scan)                                                                                                     | friends QR scanner                                                                    | Camera yes; barcode scanning on web needs testing                            | Try it; if unreliable, **typed friend codes only** on web (they already exist)                                                                                                                                                                                                                            |
| `react-native-qrcode-svg`                                                                                                   | showing your QR                                                                       | Yes (SVG)                                                                    | Use                                                                                                                                                                                                                                                                                                       |
| `@gorhom/bottom-sheet`                                                                                                      | 3 files                                                                               | Partly (mouse drag and keyboard are weak)                                    | Phone width: keep and test. **Desktop: a side panel** (`.web.tsx`)                                                                                                                                                                                                                                        |
| `react-native-reanimated` / `worklets` / `gesture-handler`                                                                  | via bottom sheet, router                                                              | Yes                                                                          | Test with mouse/touch                                                                                                                                                                                                                                                                                     |
| `@react-native-community/datetimepicker`                                                                                    | departure "at…" picker                                                                | **No**                                                                       | `departure-picker.web.tsx` with `<input type="datetime-local">`                                                                                                                                                                                                                                           |
| `expo-file-system` + `expo-sharing`                                                                                         | "Download my data"                                                                    | **No** (no file system on web)                                               | `my-data.web.ts`: build a JSON blob and download it in the browser                                                                                                                                                                                                                                        |
| `Alert.alert` (react-native)                                                                                                | 6 files: delete route, remove friend, reset, badges…                                  | **Silently does nothing on web**, so delete/confirm buttons would do nothing | One small `confirm()` helper with a web version (`window.confirm`); replace the 6 calls                                                                                                                                                                                                                   |
| `Vibration`                                                                                                                 | "time to leave" buzz                                                                  | No on iOS Safari; Android Chrome yes                                         | Leave; the on-screen message already says it                                                                                                                                                                                                                                                              |
| `@react-native-community/netinfo`, `expo-crypto`, `expo-linking`, `async-storage`, `supabase-js`, React Query, zustand, zod | various                                                                               | Yes                                                                          | Use                                                                                                                                                                                                                                                                                                       |
| Push notifications                                                                                                          | —                                                                                     | Not used in the app                                                          | Nothing to do; web uses in-app messages only                                                                                                                                                                                                                                                              |
| Background location / tasks                                                                                                 | —                                                                                     | Not used (recording needs the app open on phones too)                        | Same rule on web: recording needs the tab open, and we say so                                                                                                                                                                                                                                             |

**Build setting:** `app.json` has `"web": { "output": "static" }`, which pre-renders every page on the server. That's why the
test build crashed (the database opens at load). Use **`"output": "single"`** (single-page app): right for an app that needs
sign-in and location, and it matches "deep links must not 404".

**Outside data fetched directly by the app:** only the Transport Department traffic-news feed. It sends
`Access-Control-Allow-Origin: *`, so it works from a browser. Everything else goes through our Edge Functions.

## 2. Keys and secrets

| Key                                                                            | Where                      | Safe?                                                                                                                                  |
| ------------------------------------------------------------------------------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`             | App (`lib/supabase.ts`)    | Yes: public by design, protected by RLS                                                                                                |
| `ORS_API_KEY`, `GOOGLE_ROUTES_API_KEY`, `GOOGLE_DAILY_CAP`, `ROUTING_PROVIDER` | Edge Function secrets only | Yes: never in the app                                                                                                                  |
| Map tiles                                                                      | —                          | OpenFreeMap needs **no key**. A Google Maps JS key would be public and must be referrer-restricted, one more reason to prefer MapLibre |

- **Code search:** found no secret patterns in `app/src` or `shared/src` (Google/Supabase secret keys, service role).
- **To do in step 9:** repeat the search on the **built web bundle**.
- **Revoke now:** the Google key, ORS key and Supabase access token that were pasted into chat on 18 Oct. Rotate them before going public.

## 3. Hide from the public (dev/admin flag)

Shown today to everyone in Profile:

- **Diagnostics card:** Test backend, Simulate weather / rush hour / walk, data dates (`components/diagnostics-card.tsx`)
- **Simulated-walk controls:** Step off route, Make it rain, Report blocked path ahead (`components/follow-demo-controls.tsx`)
- **Test smart routing** (`components/smart-routing-test.tsx`)
- **Data collection mode** (Profile settings; record and review screens)
- **"Saved for the demo" fallback trips:** keep them as an offline fallback, but **not on the public site**. Labelled saved data could be mistaken for live data.

Plan: one `isAdminMode()` check, true in development builds or when a build-time flag is set. Public builds never show these.

## 4. Backend gaps for a public link

| Item                                   | Today                                                                                                                         | Needed                                                                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Rate limits on Edge Functions          | Only Google's daily cap (300/day, `api-budget.ts`); route uploads limited to 60/hour in the database                          | Per user + per IP limits on all 6 functions, friendly 429 message                                                       |
| CAPTCHA on sign-up / anonymous sign-in | Off                                                                                                                           | Cloudflare Turnstile via Supabase Auth (needs a free Cloudflare account)                                                |
| CORS                                   | `withSupabase` default (allows any site)                                                                                      | Allow our domain(s) + localhost. CORS stops other websites using our functions, not bots; rate limits + CAPTCHA do that |
| Auth redirect URLs                     | `127.0.0.1:3000` only                                                                                                         | Add production + preview URLs                                                                                           |
| Moderation                             | Shared routes show to everyone immediately (only `retired` is hidden); a `flagged` status exists but there's no report button | Report button, `flagged` hidden, and "hidden until approved" for new routes, plus an approval step for the team         |
| RLS tests                              | 76 passing                                                                                                                    | Add: anonymous web user can't read other users' data or locations                                                       |
| Cost alarm                             | Call log in `api_calls`                                                                                                       | Daily total check + "busy, showing standard routes" when the cap is hit                                                 |

## 5. What the web version will and won't do at launch

**Will:**

- Plan walking routes with shade / shelter / step-free options.
- Show the shade layer and the "Now" weather card.
- Compare walk / MTR / bus / car / taxi, with MTR live departures and bus/minibus stop arrivals.
- Show the incidents layer.
- Record a route, with the tab kept open.
- Friends: codes, requests, live location while the tab is open.
- Profile, download/delete my data, light/dark theme.

**Won't (or limited):**

- Traffic layer.
- Recording or location sharing in the background or with the screen locked.
- Vibration on iPhone.
- Push notifications.
- QR scanning (if web scanning proves unreliable).
- Demo switches.

**Not built at all, for the native app either.** These shouldn't be implied on the site:

- AI tagging of descriptions.
- Community route matching and verification (Verified badge).
- On-route pop-ups and meetups.
- **A Traditional Chinese UI.** There is no translation system in the app yet (0 i18n files). The prompt's "bilingual strings must work on web" would mean adding one first: a sizeable separate task.

## 6. Effort and order (proposed)

| Step                                                                                             | Rough size                                       |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| 2. Web build runs (map, storage, location, confirm dialogs, picker, data export, desktop layout) | Largest: about 1–2 days, mostly the MapLibre map |
| 3. Hide admin/demo features                                                                      | Small                                            |
| 4. Backend hardening                                                                             | About 1 day                                      |
| 5. PWA (manifest, icons, service worker)                                                         | Small–medium                                     |
| 6. Hosting + CI + previews                                                                       | Medium (needs the hosting decision + accounts)   |
| 7. Landing, privacy/terms drafts, attribution, feedback, Sentry, analytics                       | Medium                                           |
| 8. Playwright, real devices, Lighthouse                                                          | Medium                                           |
| 9. Production deploy + docs                                                                      | Small                                            |

**Accounts the team needs to create:** a hosting provider, Cloudflare (Turnstile), Sentry, and an analytics provider (Plausible is
paid; Umami Cloud has a free tier). These all need sign-ups in the team's name.
