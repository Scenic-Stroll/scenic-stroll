# Knowledge pins — how to run them

Knowledge pins are short, expert-checked notes about places people walk past. Walkers collect them while walking
and read them later. Background: `docs/PINS_AUDIT.md`; decisions D51–D57 in `DECISIONS.md`.

## One-time setup (team lead)

1. **Apply the migrations** in `supabase/migrations/` from `20261123100000_knowledge_pins.sql` onwards (dashboard
   → SQL editor, or the Supabase MCP `apply_migration`), then deploy the functions:
   ```bash
   npm run sync-shared
   npx supabase functions deploy pin-tools generate-pin-versions award-points plan-route geocode conditions smart-route plan-trip eta --use-api --project-ref xelzbcuzopxcterkedru
   ```
2. **AI reading versions:** `npx supabase secrets set GEMINI_API_KEY=<key> --project-ref xelzbcuzopxcterkedru`
   (Google AI Studio). Optional: `GEMINI_MODEL` (default `gemini-2.5-flash`). Without the key, "Write reading versions"
   answers that AI versions aren't set up; everything else works.
3. **Email codes for experts and reviewers:** Supabase dashboard → Authentication → Emails → "Magic link" template:
   make sure it contains `{{ .Token }}` (the 6-digit code), e.g. "Your Scenic Stroll code is {{ .Token }}".
   Supabase's built-in email sender allows only a few emails per hour — enough for a handful of experts; add your own
   SMTP (Authentication → SMTP) before inviting many.
4. **Make yourself an admin (reviewer):** sign in at `https://<site>/admin` with your email, copy the account id it
   shows, then in the SQL editor:
   ```sql
   insert into public.admins (user_id) values ('<your account id>');
   ```

## Add an expert

1. The expert opens `/admin`, signs in with their email and sends you the account id shown.
2. **Check who they are** — their ORCID record (orcid.org), a university email, or in person.
3. On `/admin` → "Add an expert": account id, the name shown on pins, their field, and the ORCID iD if they have one.
   (Or SQL: `insert into public.experts (user_id, display_name, field, verification_method, orcid_id, verified_by,
verified_at) values (…, now());`.)

## Create and review a pin

**Expert** (`/admin` → New pin):

1. Click the map where the pin belongs. It offers the walkway point (pedestrian network) or mapped place (OSM)
   within 25 m — or choose **Custom place** and describe it (for a tree, a boundary stone…).
2. Title, a **summary in your own words using only facts from your sources**, radius (30/40/50 m), topics, SDG tags.
   Save.
3. On the pin's page: add **sources** — paste a DOI or a title and "Look up" (OpenAlex, then Crossref), or add a web
   page by hand. Optionally a "Why it matters beyond Hong Kong" line with **its own source**.
4. **Write reading versions (AI)** — child, teen and adult texts with 1–2 questions each, written only from your
   summary, all marked "in review". Fix anything on the page. **Send for review.**

**Reviewer** (an admin):

1. Open the pin under "Waiting for review". Each version and its questions sit next to the summary and sources.
2. Edit if needed (saving a change sends that version and its questions back to review), then **Approve** — or
   **Reject** a version (back to draft) / delete a question.
3. **Publish** — possible only when the adult version and all its questions are approved. The label is
   **Expert-verified** if the author is a verified expert and a verified expert approved the adult text, otherwise
   **AI-summarized**. **Pause** takes a live pin off the map.

**Sample pin:** `supabase/seed/sample_pin.sql` creates "Why Kent Road is in Kowloon" (in review, marked as sample, two
checked sources, no summary — the expert writes it). Put an expert's account id in it and run it in the SQL editor.

## Change the points rules

All numbers are in **`shared/src/pointsRules.ts`** (steps per km, tiers, daily cap, speed limit, pin-read amount,
minimum reading time). Change them there, run `npm test` (the cases in `shared/src/points.test.ts` show what each
rule does — update them too), then deploy `award-points` (`npm run sync-shared` first). Past awards are not
recalculated: the ledger is append-only. Points can't be bought, cashed out or transferred — don't add anything that
does.

## Safety mode (under-18s)

- Set by the age band on the consent screen; **it can't be turned off**: there is no switch, the database computes it,
  refuses a change back to adult and refuses deleting the settings. Reading style (child/teen/adult) is separate.
- **Off for them:** route recording, friends, location sharing, shop offers, points (badges only). The database refuses
  routes, descriptions, friend codes, friendships and location shares from under-18 accounts, and deletes them if an
  account switches to under-18.
- **Collection:** kept on the device only; the server just counts "pin unlocked" (pin, day) with no user.
- If someone answered the age question wrongly: an admin can correct it in the SQL editor
  (`update public.user_settings set age_band = 'adult' where user_id = '…'`) — only after checking.

## Collecting and reading (for testers)

- Pins are collected only while the app is open and **tracking** — walking with directions or recording: a good GPS
  fix (≤ 30 m) inside the radius and then another one (or ≥ 5 s inside). Only a small "Pin saved: …" toast appears.
- My collection (centre tab) lists them, unread first. Reading one for ≥ 10 s and tapping "Done reading" gives
  pin-read points (adults, once per pin).
