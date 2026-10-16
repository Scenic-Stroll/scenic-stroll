# Setup guide (Windows & macOS)

This gets you from zero to the app running on your own phone. No prior React Native experience needed.
If a step fails, copy the exact error into the team chat.

---

## 1. Install the tools (once per computer)

| Tool                             | Windows                                                                | macOS                        |
| -------------------------------- | ---------------------------------------------------------------------- | ---------------------------- |
| **Node.js 22 LTS or newer**      | Download the LTS installer from <https://nodejs.org> and click through | Same, or `brew install node` |
| **Git**                          | <https://git-scm.com/download/win> (keep the defaults)                 | `xcode-select --install`     |
| **VS Code** (recommended editor) | <https://code.visualstudio.com>                                        | same                         |

Check it worked — open a **new** terminal (Windows: "Terminal" or "PowerShell"; macOS: "Terminal"):

```bash
node -v   # should print v22.x or higher
npm -v
git --version
```

You do **not** need Android Studio, Xcode or Docker.

## 2. Install Expo Go on your phone

- iPhone: App Store → **Expo Go**
- Android: Play Store → **Expo Go**

Already have it? **Update it** — the project uses Expo SDK 57 and an old Expo Go will refuse to open it.

## 3. Get the code and install packages

```bash
git clone <the repo URL from the team chat> scenic-stroll
cd scenic-stroll
npm install
```

`npm install` at the repo root installs everything for the app and the shared package (it's an npm
"workspaces" monorepo). It takes a few minutes the first time.

## 4. Add the Supabase settings

1. Copy `app/.env.example` to `app/.env`
   - Windows (PowerShell): `Copy-Item app/.env.example app/.env`
   - macOS: `cp app/.env.example app/.env`
2. Open `app/.env` and paste the two values the team lead shared (project URL and **publishable** key).

`app/.env` is git-ignored. Only the publishable key goes here — it's safe in the app because database
rules (RLS) protect the data. **Never** put a secret key, service-role key or LLM key in the app.

## 5. Run the app

```bash
npm start
```

A QR code appears in the terminal.

- **iPhone:** open the Camera app, point it at the QR code, tap the banner.
- **Android:** open Expo Go → "Scan QR code".

Your phone and computer must be on the **same Wi-Fi**. On campus Wi-Fi (eduroam / CityU) devices often
can't see each other — then stop the server and run:

```bash
npm start -- --tunnel
```

Edit any file in `app/src` and save: the phone reloads automatically. Shake the phone to open the developer menu.

### Check it works (Phase 0)

Open the **Settings** tab. You should see:

- **Account:** `Anonymous account · xxxxxxxx` — anonymous sign-in worked.
- **About:** `30 route tags loaded` — the shared package works.

If Account says _"Supabase is not configured"_, your `app/.env` is missing or wrong — fix it, then stop
and restart `npm start`. If it says _"Anonymous sign-ins are disabled"_, ask the team lead to do step 6.3.

## 6. Supabase project (team lead only, once)

1. Create an account at <https://supabase.com> → **New project**. Region: **Southeast Asia (Singapore)**.
   Save the database password in the team password manager.
2. **Project Settings → API Keys**: copy the **Project URL** and **publishable key** for everyone's `app/.env`.
3. **Authentication → Sign In / Providers → Anonymous sign-ins: ON**.
4. Link the repo and apply the database migrations (the CLI runs through `npx`, nothing to install):

   ```bash
   npx supabase login            # opens the browser
   npx supabase link --project-ref <your-project-ref>   # the ref is in the project URL
   npx supabase db push          # applies everything in supabase/migrations
   ```

   There is one shared database (see DECISIONS.md D1) — only push migrations that have been reviewed.

## 7. Server-side API keys (Phase 1 and later)

These keys **only** ever go into Supabase secrets, never into the app or git:

| Key                                                  | Where to get it                                                         | Used for                     |
| ---------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------- |
| `ORS_API_KEY`                                        | <https://openrouteservice.org/dev/#/signup> → Dashboard → Tokens (free) | Standard walking routes      |
| `GOOGLE_ROUTES_API_KEY` (optional)                   | Google Cloud Console → enable _Routes API_ → Credentials                | Alternative routing provider |
| `GEMINI_API_KEY`                                     | <https://aistudio.google.com> → Get API key (free tier)                 | AI tagging (default)         |
| `DEEPSEEK_API_KEY` / `OPENROUTER_API_KEY` (optional) | platform.deepseek.com / openrouter.ai                                   | Alternative LLMs             |

Set them with:

```bash
npx supabase secrets set ORS_API_KEY=xxxx GEMINI_API_KEY=xxxx --project-ref xelzbcuzopxcterkedru
```

## 8. Deploy Edge Functions and check they work

The map route (`plan-route`), place search (`geocode`), live weather (`conditions`, Hong Kong Observatory —
no key needed) and our computed routes (`smart-route`, on the walking graph — no key needed) run on Supabase, not
on the phone. If the app
says **“… isn’t deployed on the server yet”** (or the old “Requested function was not found”), run this:

```bash
npx supabase login                                         # once per computer (opens the browser)
npx supabase link --project-ref xelzbcuzopxcterkedru        # once per clone
npx supabase secrets set ORS_API_KEY=<your-ors-key>         # once per project (see step 7)
npm run deploy:functions                                    # copies /shared in, deploys every function
npm run check:functions                                     # ✓ for every function = deployed
npm run smoke:routing                                       # signs in + plans Exit A1 → MMW for real
```

- `deploy:functions` uses `--use-api`, so Docker isn’t needed. Always deploy with this script (not a bare
  `supabase functions deploy`): it first copies `/shared` into `supabase/functions/_shared/scenic`.
- `check:functions` also fails if the app calls a function by a hand-typed name — every name lives in
  `FUNCTIONS` in `shared/src/api.ts`.
- On the phone: **Settings → Diagnostics → Test backend** shows ✓/✗ for each function and names any
  missing server key.

| What you see in the app                                  | Fix                                                                               |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| “… isn’t deployed on the server yet”                     | `npm run deploy:functions`                                                        |
| “You’re not signed in…” / Diagnostics says Signed in: No | Dashboard → Authentication → Anonymous sign-ins **ON**, then Settings → Try again |
| “The server is missing a key: ORS_API_KEY is not set”    | `npx supabase secrets set ORS_API_KEY=…` (no redeploy needed)                     |
| “Can’t reach the server”                                 | Phone is offline — routes still record and upload later                           |
| “Now” card: “Live weather unavailable”                   | HKO or our server unreachable; card uses time of day. `npm run smoke:routing`     |

## 9. Walking graph (smart routing) — rebuild only when the map data changes

Smart routes run on our own walking graph in Supabase (`graph_builds`, `ped_nodes`, `ped_edges`), built from the
Lands Department **3D Pedestrian Network** (open data, updated quarterly). It is already loaded; rebuild it only
to pick up new data or a bigger area (`GRAPH_BBOX` in `shared/src/graph-area.ts`).

```bash
npm run graph:download   # 3DPN for the area + 300 m margin → scripts/graph/data/3dpn.json (~1 min)
npm run graph:build      # nodes + edges + checks → scripts/graph/data/graph.json, prints a report
npm run graph:key        # prints a one-day loader key + one SQL line
#   → paste the SQL line into Supabase dashboard → SQL editor → Run
GRAPH_LOADER_KEY=<key> npm run graph:load   # uploads (~15 s), then switches the app to the new graph
```

- Read the build report: the biggest connected piece should be ~99 % of nodes and every MTR exit matched.
- The old graph keeps serving until the last step of `graph:load`, so a failed upload changes nothing.
- The key expires after 24 h; only its hash is stored. Never commit it.
- **Shade** (refresh every ~2 weeks, and the day before a demo — the sun's path moves):

  ```bash
  npm run graph:download-shade              # building heights (Lands Dept) + trees (OpenStreetMap)
  npm run graph:shade -- 2026-10-24         # shade for that day, every 30 min 07:00–19:00 (~1 s)
  GRAPH_LOADER_KEY=<key> npm run graph:load-shade   # onto the live graph; no rebuild needed
  ```

  Diagnostics → Shade shows the day it was computed for.

- Tuning routes: edit the weights in `shared/src/routing-profiles.ts`, then `npm run graph:try` prints the demo trips
  (fastest / sheltered / cool / step-free / 2 am) from the local graph — no deploy needed to compare.
- Phone check: **Profile → Diagnostics → Walk map** shows the data date and number of paths.

## 10. Before you push code

```bash
npm run typecheck
npm run lint
npm test
npm run format
```

All four must pass.

---

### Troubleshooting

| Problem                                                | Fix                                                             |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| "Project is incompatible with this version of Expo Go" | Update Expo Go from the app store                               |
| QR code opens but loads forever                        | Use `npm start -- --tunnel`                                     |
| `npm` / `node` not found on Windows                    | Close and reopen the terminal after installing Node             |
| PowerShell says "running scripts is disabled"          | Run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| Changes to `.env` don't show up                        | Stop the server (Ctrl+C) and run `npm start -- --clear`         |
