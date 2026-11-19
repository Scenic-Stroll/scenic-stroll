# Deploying the web app

The web version of Scenic Stroll is hosted on **EAS Hosting** (Expo's hosting, DECISIONS D41 and D46).
It is a single-page app: `npm run build:web` (in `app/`) makes the `app/dist/` folder, and that folder is
uploaded.

| What                                   | Address                                      |
| -------------------------------------- | -------------------------------------------- |
| Production                             | https://scenic-stroll.expo.app               |
| Previews (each PR, each manual deploy) | https://scenic-stroll--&lt;id&gt;.expo.app   |
| Dashboard                              | expo.dev → spidexz → scenic-stroll → Hosting |

The Expo project is `@spidexz/scenic-stroll` (its ID is in `app/app.json` → `extra.eas.projectId`).

## Normal way: GitHub does it

`.github/workflows/web.yml` runs on every pull request and every push to `main`:

1. `npm ci`, then type check, lint, all tests (app, Edge Functions, database security) and formatting.
2. `npm run build:web` (export + service-worker stamp).
3. Deploy: a pull request gets its own preview link (shown in the run's summary and as a notice on the run); a merge to `main`
   **goes straight to production**. Pull requests from forks are checked but not deployed (no secrets).

### One-time setup (team lead)

GitHub → the repo → Settings → Secrets and variables → Actions:

- **Secret** `EXPO_TOKEN`: expo.dev → Account settings → Access tokens → create one called "GitHub Actions".
- **Variables** (not secrets — they are public anyway, because they end up in the web page):
  - `EXPO_PUBLIC_SUPABASE_URL` — same value as in `app/.env`
  - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — same value as in `app/.env`

Or with the GitHub CLI: `gh secret set EXPO_TOKEN`, `gh variable set EXPO_PUBLIC_SUPABASE_URL --body "…"`.

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

## Custom domain (optional, later)

If the team buys a domain (e.g. `scenicstroll.hk`):

1. expo.dev → scenic-stroll → Hosting → Settings → Custom domain → enter it. Custom domains need a paid
   Expo plan — check the current plan page first.
2. Expo shows the DNS records to add (usually a `CNAME` for `www`, and the records it lists for the bare
   domain). Add them at the domain registrar. HTTPS certificates are issued automatically.
3. Add the domain to `ALLOWED_ORIGINS` (above) and redeploy nothing — the secret takes effect at once.
4. Update the links in the app's landing/privacy pages and in `docs/LAUNCH_CHECKLIST.md`.
