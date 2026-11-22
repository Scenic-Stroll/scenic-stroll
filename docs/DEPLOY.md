# Deploying the web app

The web version of Scenic Stroll is hosted on **Vercel** (D50) and/or **EAS Hosting** (Expo's hosting, D41, D46) —
the same build works on both.
It is a single-page app: `npm run build:web` (in `app/`) makes the `app/dist/` folder, and that folder is
uploaded.

| What                                   | Address                                      |
| -------------------------------------- | -------------------------------------------- |
| Production                             | https://scenic-stroll.expo.app               |
| Previews (each PR, each manual deploy) | https://scenic-stroll--&lt;id&gt;.expo.app   |
| Dashboard                              | expo.dev → spidexz → scenic-stroll → Hosting |

The Expo project is `@spidexz/scenic-stroll` (its ID is in `app/app.json` → `extra.eas.projectId`).

## CI: GitHub checks every change

`.github/workflows/web.yml` runs on every pull request and every push to `main`:

1. `npm ci`, then type check, lint, all tests (app, Edge Functions, database security) and formatting.
2. `npm run build:web` (export + service-worker stamp) — proves the website builds.
3. **Deploy to EAS Hosting (optional).** We deploy with **Vercel**, which builds the site itself (see "Alternative:
   Vercel" below), so this step normally **skips**: without an `EXPO_TOKEN` secret it logs
   "EAS deploy skipped … Vercel builds and deploys this site itself" and the run stays green. With the secret, a pull
   request gets an EAS preview link and a merge to `main` goes to EAS production too.

### Repository settings CI needs

GitHub → the repo → Settings → Secrets and variables → Actions.

| Name                                   | Kind     | Needed?                                     | Value                                       |
| -------------------------------------- | -------- | ------------------------------------------- | ------------------------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`             | variable | **required** — the build step stops without | same as in `app/.env`                       |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | variable | **required**                                | same as in `app/.env` (`sb_publishable_…`)  |
| `EXPO_PUBLIC_SENTRY_DSN`               | variable | optional — website error reports            | sentry.io → project → Client Keys (DSN)     |
| `EXPO_PUBLIC_UMAMI_WEBSITE_ID`         | variable | optional — visit counts                     | cloud.umami.is → website → Website ID       |
| `EXPO_TOKEN`                           | secret   | optional — only to also deploy to EAS       | expo.dev → Account settings → Access tokens |

They are **variables**, not secrets, because they are public anyway (they end up in the web page). Set them from
`app/.env` without typing or printing the values (from the repo root):

```bash
grep '^EXPO_PUBLIC_SUPABASE_URL=' app/.env | cut -d= -f2- | gh variable set EXPO_PUBLIC_SUPABASE_URL
grep '^EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=' app/.env | cut -d= -f2- | gh variable set EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
gh variable list        # names only
```

Check first that the key starts with `sb_publishable_` (or, for an old-style key, that it is the "anon" key).

> **Never** put a secret key (service role key, ORS/Google server keys) in an `EXPO_PUBLIC_` variable. Everything
> in the web build can be read by anyone. Server keys live only in Supabase (`npx supabase secrets set`).
> `EXPO_PUBLIC_ADMIN_TOOLS` must stay unset for public builds (DECISIONS D43).

Preview and production builds use the same Supabase project (there is only one). Previews therefore see
real data — don't use them for load tests.

## By hand (from your computer)

```bash
cd app
npx eas-cli login                 # once; the account must be in the spidexz project (or use EXPO_TOKEN)
npm run build:web                 # makes dist/
npx eas-cli deploy                # preview link, printed at the end
npx eas-cli deploy --prod         # production — only when the team agreed
```

Roll back: expo.dev → Hosting → Deployments → pick an older one → "Promote to production", or
`npx eas-cli deploy:alias --prod --id <deployment id>`.

## Things the hosting setup relies on

- **Deep links** (`/add/<code>`, `/friend/<id>`, …): EAS Hosting answers any unknown path with `index.html`,
  so they open the app instead of a 404. Checked on the first preview (2026-11-20).
- **HTTPS everywhere:** `*.expo.app` is HTTPS only — needed for location and the installable app (PWA).
- **Caching:** EAS Hosting lets browsers keep files for 1 hour. The service worker (`app/public/sw.js`)
  re-checks pages and unhashed files with the server, so a new release shows up on the next visit; browsers
  check `sw.js` itself for updates without using that cache.
- **Which websites may call our Edge Functions (CORS):** the Supabase secret `ALLOWED_ORIGINS`.
  ```bash
  npx supabase secrets set "ALLOWED_ORIGINS=https://scenic-stroll.expo.app,https://scenic-stroll--*.expo.app" --project-ref xelzbcuzopxcterkedru
  ```
  `*` matches letters, digits and dashes (all preview links). Localhost is always allowed for development.
  Phones send no Origin header and are never blocked. **Add the custom domain here if you get one.**
- **Supabase Auth redirect URLs:** not needed today — the app only uses anonymous sign-in, which has no
  redirect. If email links or Google sign-in are added, add the production and preview addresses under
  Supabase dashboard → Authentication → URL Configuration.

## Error reports and visit counts (DECISIONS D47)

- **Website errors → Sentry:** set the `EXPO_PUBLIC_SENTRY_DSN` variable (above) and redeploy.
- **Edge Function crashes → Sentry:** create a second Sentry project "scenic-stroll-functions" (platform:
  Node / Other) and give its DSN to Supabase:
  `npx supabase secrets set SENTRY_DSN=<dsn> --project-ref xelzbcuzopxcterkedru` (no redeploy needed).
- **Visit counts → Umami:** set `EXPO_PUBLIC_UMAMI_WEBSITE_ID` and redeploy. Counts page views plus three events:
  `route-planned`, `route-recorded`, `feedback-sent`. No cookies; respects "Do Not Track".
- Personal data is removed before anything is sent (`shared/src/privacy.ts`): no IP address or user id, no query
  strings, and coordinates become `[coord]`. If you add a new kind of report, keep it that way — and update
  the privacy policy (`app/src/content/privacy.ts`).

## Alternative: Vercel

The same website can also be hosted on Vercel (free Hobby plan — personal, non-commercial projects only).
`vercel.json` at the repo root has everything Vercel needs: install from the root (the app uses the `shared/`
workspace), build with `npm run build:web --workspace app`, publish `app/dist`, send every address to `index.html`
(so `/privacy` and shared links don't 404), and cache headers (`sw.js` always re-checked, hashed files for a year).

1. Push the branch to GitHub.
2. vercel.com → Add New → Project → import `Scenic-Stroll/scenic-stroll`. Leave **Root Directory** empty (the repo
   root) — the settings come from `vercel.json`.
3. Environment Variables (Production and Preview): `EXPO_PUBLIC_SUPABASE_URL` and
   `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (same values as `app/.env`; optional: `EXPO_PUBLIC_SENTRY_DSN`,
   `EXPO_PUBLIC_UMAMI_WEBSITE_ID`). Never a secret key.
4. Deploy. You get `https://<project>.vercel.app`; every pull request gets its own preview link.
5. **CORS — let the Vercel site call the Edge Functions.** Add the Vercel addresses to `ALLOWED_ORIGINS` (keep the
   EAS ones if that host stays). Replace `scenic-stroll` with your Vercel project name if it differs:
   ```bash
   npx supabase secrets set "ALLOWED_ORIGINS=https://scenic-stroll.vercel.app,https://scenic-stroll-*.vercel.app,https://scenic-stroll.expo.app,https://scenic-stroll--*.expo.app" --project-ref xelzbcuzopxcterkedru
   ```
   While `ALLOWED_ORIGINS` is not set, every site may call them (nothing to do). Once it is set, a Vercel address
   missing from it loads the page but can't plan routes ("This website may not use the Scenic Stroll API").

The share image and `og:url` in `app/public/index.html` point at `scenic-stroll.expo.app`; change them if Vercel becomes
the main address.

## Server functions and the database

The website only shows things; routes, weather and saving happen in the Supabase Edge Functions and database.
They are deployed separately from the website (docs/SETUP.md §8):

```bash
npm run sync-shared
npx supabase functions deploy plan-route geocode conditions smart-route plan-trip eta --use-api --project-ref xelzbcuzopxcterkedru
npm run smoke:routing            # sign in, plan a route, weather, a computed route — all against the live project
```

Database changes are migrations in `supabase/migrations/`, applied in the dashboard (SQL editor) or with the
Supabase MCP `apply_migration`. Run `npm run test:db` first — it applies every migration to a local Postgres and checks
the security rules.

## Rotating keys

Do this when a key may have leaked (pasted in a chat, shown in a log, a teammate leaves) — and **once before the public
launch**, because the ORS, Google and Supabase keys were pasted in chat during the hackathon and the ORS key appeared in a
function log (DECISIONS D48).

| Key                                            | Where it lives                    | How to rotate                                                                                                                                                                                                                        |
| ---------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| openrouteservice (`ORS_API_KEY`)               | Supabase secret                   | openrouteservice.org → Dashboard → Tokens → create a new token, then `npx supabase secrets set ORS_API_KEY=<new> --project-ref xelzbcuzopxcterkedru`, run `npm run smoke:routing`, then delete the old token.                        |
| Google Maps Platform (`GOOGLE_ROUTES_API_KEY`) | Supabase secret                   | Google Cloud console → APIs & Services → Credentials → create a new key, restrict it to the Routes API (API restrictions), set it the same way, smoke test, then delete the old key. Check the daily cap: `GOOGLE_DAILY_CAP` secret. |
| Supabase personal access token (`sbp_…`)       | your computer (CLI/MCP login)     | supabase.com/dashboard/account/tokens → revoke it, create a new one, `npx supabase login`.                                                                                                                                           |
| Expo access token (`EXPO_TOKEN`)               | GitHub secret                     | expo.dev → Account settings → Access tokens → revoke and create; update the GitHub secret.                                                                                                                                           |
| Supabase publishable key                       | `app/.env`, GitHub variable       | Public by design (it is in every web page and phone app); rotate only if abused: dashboard → Project Settings → API Keys. Update `app/.env`, the GitHub variable, and ship new phone builds.                                         |
| Sentry DSN                                     | GitHub variable / Supabase secret | Public by design; if spammed: Sentry → Client Keys → disable and create a new one.                                                                                                                                                   |

Server secrets take effect on the next request — no function redeploy is needed. **Never** paste a key into a chat,
issue or commit; give it to `npx supabase secrets set` directly.

## Limits to keep an eye on

- **EAS Hosting free plan: 100,000 requests a month.** A first visit loads ~25–50 files (later visits mostly come
  from the phone's saved copy), so roughly 2,000–4,000 new visitors a month. Usage: expo.dev → Billing.
- **Database:** on the free ("nano") compute the walking-route function handles about **5 requests at the same time**
  (docs/TESTING.md). Supabase Pro + a bigger compute size before promoting the link widely.
- **Supabase free projects pause after 7 days without use** — Pro doesn't.
- **openrouteservice free tier:** 2,000 directions a day (`plan-trip` stops using it at 1,500 a day). It was down
  several times during the hackathon and on 20 November; the computed walking routes keep working without it, the
  standard street route and place search don't.
- **Google:** the daily cap (`GOOGLE_DAILY_CAP`) protects the bill; `COST ALARM` lines appear in the function logs at 80 %.

## Custom domain (optional, later)

If the team buys a domain (e.g. `scenicstroll.hk`):

1. expo.dev → scenic-stroll → Hosting → Settings → Custom domain → enter it. Custom domains need a paid
   Expo plan — check the current plan page first.
2. Expo shows the DNS records to add (usually a `CNAME` for `www`, and the records it lists for the bare
   domain). Add them at the domain registrar. HTTPS certificates are issued automatically.
3. Add the domain to `ALLOWED_ORIGINS` (above) and redeploy nothing — the secret takes effect at once.
4. Update the links in the app's landing/privacy pages and in `docs/LAUNCH_CHECKLIST.md`.
