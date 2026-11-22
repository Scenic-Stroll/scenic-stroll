# Launch checklist — public web app

**Site:** https://scenic-stroll.expo.app (production since 21 November 2026, labelled **Beta**)
**How to deploy, roll back, rotate keys:** `docs/DEPLOY.md` · **How to test:** `docs/TESTING.md` ·
**Why things are the way they are:** `DECISIONS.md` D41–D48.

The site works today. "Ready to share widely" needs the **Before sharing the link** items below.

## Definition of done (from the launch brief)

| #   | Item                                                                                     | Status                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A public HTTPS URL opens Scenic Stroll on phone and desktop browsers                     | ✅ production is live; 41/41 Playwright tests pass against it (Chromium + WebKit, phone + desktop). Real devices: see below.                                                  |
| 2   | Route planning, shade/step-free, transport comparison, recording and friends work on web | ✅ planning, step-free, "All", recording offline → upload: automated tests. ⚠️ **Friends** (add by code, QR scan, live location) not yet tested on web — real-device check.   |
| 3   | Installable as a PWA on iOS and Android                                                  | ⚠️ manifest, icons, service worker and offline page are live; installing on a real iPhone and Android phone is still to do.                                                   |
| 4   | No secret keys in the web bundle                                                         | ✅ production build scanned (Google, ORS, Supabase secret/service-role, access-token patterns): none. Only the public Supabase URL and publishable key.                       |
| 5   | Rate limits, CAPTCHA, CORS and API caps active; RLS tests pass                           | ✅ rate limits, Google daily cap + cost alarm, 88 database security tests. ⚠️ **CORS allow-list** written and tested but its secret isn't set. ❌ **CAPTCHA** deferred (D44). |
| 6   | Demo/diagnostic switches not visible to the public                                       | ✅ hidden in production builds (D43).                                                                                                                                         |
| 7   | Privacy policy (draft), terms, attribution and feedback pages are live                   | ✅ `/privacy`, `/terms`, `/attribution`, `/feedback`. ⚠️ contact email is a placeholder; drafts need the team's review; no Traditional Chinese yet.                           |
| 8   | Error monitoring and privacy-friendly analytics are working                              | ⚠️ code is live and switched off until the Sentry and Umami settings exist.                                                                                                   |
| 9   | Playwright suite passes; Lighthouse targets met                                          | ✅ Playwright 41/41. Lighthouse: accessibility, best practices, SEO 100. ❌ **performance: phone 38, desktop 79** (target 80).                                                |
| 10  | The native iOS/Android app still builds and its tests pass                               | ✅ iOS and Android bundles export; 318 app/shared, 14 function, 88 database tests pass. (A full native build on EAS/Xcode wasn't run.)                                        |
| 11  | docs/DEPLOY.md explains redeploy, key rotation and rollback                              | ✅                                                                                                                                                                            |

## Before sharing the link

Team lead (needs your accounts — can't be done from code):

- [ ] **Rotate the keys** pasted in chat during the hackathon: openrouteservice (it also appeared in a function log),
      Google Maps Platform, Supabase access token. Steps: DEPLOY.md → Rotating keys.
- [ ] **Supabase Pro** + a bigger compute size (free: ~5 walking routes at once, pauses after 7 days). Then
      `npm run load:test` again — goal: 50 at once without errors.
- [ ] **CORS allow-list:**
      `npx supabase secrets set "ALLOWED_ORIGINS=https://scenic-stroll.expo.app,https://scenic-stroll--*.expo.app" --project-ref xelzbcuzopxcterkedru`
- [ ] **Contact email** in `app/src/content/privacy.ts` and `terms.ts`; the team reads both drafts (ideally someone with
      PDPO knowledge — they are not legal advice).
- [ ] **Sentry** (2 projects) and **Umami** (1 website), then the GitHub variables / Supabase secret — DEPLOY.md.
- [ ] **GitHub:** `EXPO_TOKEN` secret and the two `EXPO_PUBLIC_SUPABASE_*` variables; push `web-launch`, open a pull
      request, check the preview, merge (→ production deploys automatically).
- [ ] **Real phones:** the 10 checks in TESTING.md §4 on an iPhone and an Android phone, including Friends.

## Soon after launch

- [ ] **Phone performance** (Lighthouse 38 → 80): load the map library and route planner only when needed; trim the
      940 KB shared bundle (~520 KB unused on first load).
- [ ] **CAPTCHA** (Cloudflare Turnstile) once the phone apps have a CAPTCHA screen (D44). Until then: Supabase's 30 new
      anonymous accounts per hour per IP.
- [ ] **A designed logo** for the web and the phone apps (both are placeholders; the phone apps still show Expo's icon).
- [ ] **Cache computed routes** for the preset trips (fewer database calculations under load).
- [ ] **Traditional Chinese** privacy policy and terms.
- [ ] **Browser tests in CI** against each preview (mind the 100,000 EAS Hosting requests a month).
- [ ] Planner shows "Couldn't get a route" when only the standard street route failed (e.g. openrouteservice down) even
      though computed routes are listed — reword it to "Street route unavailable".
- [ ] A web invite link (`/add/<code>`) if friends should be able to share invites from the website.

## Watching it

- **Function logs:** Supabase dashboard → Edge Functions → Logs. Search `COST ALARM`, `rate limited`, `crashed`.
- **Shared routes waiting for review, feedback, paid API usage:** SQL in docs/SETUP.md §9b.
- **Hosting usage:** expo.dev → Billing (100,000 requests a month on the free plan).
- **Quick health check:** `npm run smoke:routing`; full check: `npm run test:e2e`.
