# Testing the web app

Everything below is about the **public website** (web launch step 8, DECISIONS D48). The everyday checks
(`npm run typecheck && npm run lint && npm test && npm run format:check`) are in `docs/SETUP.md` §10.

## 1. End-to-end tests (Playwright)

Real browsers — Chromium and WebKit (Safari's engine), at phone and desktop size — click through the website
the way a person would. Files: `e2e/`, settings: `playwright.config.ts`.

```bash
npx playwright install chromium webkit                      # once per computer
npm run test:e2e                                            # tests https://scenic-stroll.expo.app
BASE_URL=https://scenic-stroll--abc123.expo.app npm run test:e2e   # tests a preview link
npx playwright show-report e2e/report                       # what failed, with screenshots
```

| Test                     | What it checks                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `plan-route` — demo trip | Kowloon Tong Exit A1 → Mong Man-wai Building shows computed routes with "% covered" (and "% shaded" while the sun is up) plus the standard route       |
| `plan-route` — step-free | the Step-free tab picks a "Step-free route" and none of its directions mention stairs or escalators                                                    |
| `plan-route` — All       | Exit A1 → Tsim Sha Tsui at 10:00 shows walk, public transport, car and taxi (the demo trip is too short for the MTR to beat walking — the app says so) |
| `location-denied`        | with location blocked, "Show my location" explains how to fix it, and planning works from a picked start                                               |
| `record-offline`         | record a walk (fake GPS), go offline, Stop → Review → Save: it shows "Waiting to upload"; back online it uploads by itself                             |
| `pages`                  | welcome screen (Beta, coverage, Start, remembered), privacy and terms (marked draft), credits, "Page not found"                                        |

Things to know:

- They use the **live backend**: route tests fail when openrouteservice or Google are down, and they count against
  the rate limits. They run one at a time and share **one** anonymous account (`e2e/session.setup.ts`), because
  Supabase allows only 30 new anonymous accounts per hour per IP address.
- The recording test never uploads for real: `fetch` is replaced inside the page for `create_route`. (Playwright's
  own `page.route` does not see requests from a page with a service worker in WebKit — an earlier version of the
  test created 5 real routes that way; they were deleted.)
- Service workers are blocked except in the recording test. Otherwise every fresh test browser downloads the whole
  app twice and EAS Hosting answers HTTP 429 (blank pages).
- Not in CI yet: a run makes ~2,000 requests to EAS Hosting (free plan: 100,000 a month) and depends on outside
  services. Run it by hand on a preview before merging to `main`.

## 2. Load test

```bash
npm run load:test                                   # 50 requests at once: smart-route + plan-route
REQUESTS=10 ONLY=smart-route npm run load:test      # one function, fewer requests
```

Only free functions are called (`plan-trip` uses Google's paid APIs and is never load-tested). Each run creates 5
anonymous test users.

## 3. Lighthouse

```bash
npx lighthouse https://<site>/ --only-categories=performance,accessibility,best-practices,seo --view
npx lighthouse https://<site>/ --preset=desktop --only-categories=performance,accessibility,best-practices,seo --view
```

Targets from the launch brief: Performance ≥ 80 (phone), Accessibility ≥ 90, Best Practices ≥ 90. Lighthouse 12
no longer has a "PWA" score; installability is checked by hand (section 4).

## 4. Real phones (by hand, before launch)

Use the preview or production link. Tick each on **iPhone (Safari)** and **Android (Chrome)**:

- [ ] Site opens; welcome screen → Start; the map shows.
- [ ] Allow location: the blue dot appears where you are. Then block it in site settings: the message explains how
      to turn it back on, and you can still pick a start.
- [ ] Plan Exit A1 → MMW; switch Step-free; open "All".
- [ ] **Install:** iPhone — Share → Add to Home Screen; Android — ⋮ → Install app. The icon is the green path-and-pin,
      it opens full screen without the browser bar.
- [ ] Installed app, **airplane mode**, open it: it opens with "You’re offline". Turn data back on: the bar goes away.
- [ ] Record a short walk outdoors (2–3 minutes). Stop → Review → Save & upload. Try once with airplane mode on at
      Save, then turn it off: it uploads by itself (My routes shows "Uploaded").
- [ ] Friends → Add friend → scan a QR code (camera permission prompt, then it reads the code).
- [ ] Profile → Download my data saves a file; Privacy policy, Terms and Data sources open.
- [ ] Dark mode (phone setting): everything readable.
- [ ] Share the link in WhatsApp: the preview shows the title, description and green image.

## Results — 20 November 2026

**Playwright:** 41 tests (6 scenarios + page checks × 4 browsers). Final run on the preview: **29 passed, 12 failed** —
all 12 are the three route-planning tests, failing only because openrouteservice was down (connection refused) and
the standard street route couldn't be fetched; the computed routes showed. All three had passed in all four browsers
in the run before the outage. Writing the tests found four real bugs in the web app, all fixed (D48):

1. Recording never received GPS once the map's location dot was on (expo-location's web version mixes up watch ids).
2. Recording didn't start at all when the browser refused to keep the screen on (Wake Lock).
3. After recording offline, "Review route" spun forever (TanStack Query paused on-device data while offline), and its
   code couldn't load offline (screens' code is now saved by the service worker at install).
4. Recordings saved offline didn't upload when the connection came back (NetInfo doesn't report it in browsers).

**Load test (free Supabase database, "nano" compute):**

| Requests at once         | Result                                                                    |
| ------------------------ | ------------------------------------------------------------------------- |
| 5 × smart-route          | all OK, ~6 s each                                                         |
| 10 × smart-route         | 7 of 10 failed (database statement timeout)                               |
| 25 smart + 25 plan-route | 6 OK; smart-route timeouts; plan-route failed — openrouteservice was down |

Cost of a run: $0 (own database + openrouteservice free tier). **The database is the bottleneck:** each smart route
reads ~2,500–5,000 path segments (~150 ms of database work). Before a public launch: Supabase Pro with a bigger
compute size, then run the load test again. A short-lived cache of computed routes for the preset trips would also
help. When smart-route fails the app falls back to the standard street route.

**Lighthouse (home page, preview):**

|         | Performance   | Accessibility | Best Practices | SEO |
| ------- | ------------- | ------------- | -------------- | --- |
| Phone   | 38 ❌         | 100           | 100            | 100 |
| Desktop | 79 (≈ target) | 100           | 100            | 100 |

Accessibility went from 84 to 100 (bottom-sheet "slider" roles, tab roles, image alt text). Performance on a
throttled phone misses the target: ~2.4 MB of JavaScript takes ~1.8 s of main-thread time (LCP 8 s on a slow 4G
profile). Biggest wins, not done yet: load the map library and the planner only when needed, and trim the 940 KB
shared bundle (Lighthouse: ~520 KB unused on first load).
