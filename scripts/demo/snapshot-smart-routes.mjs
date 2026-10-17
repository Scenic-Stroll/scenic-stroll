// Saves the live smart-route answers for the demo trips into the app (demo safety, brief §10):
// if the network, HKO or Supabase is down during the pitch, the app shows these saved routes for
// the demo trips instead of only the standard route — clearly labelled as saved.
//
// Run (online, the day before the demo):  npm run demo:snapshot -- 2026-10-24
// Writes app/src/demo/smart-route-snapshot.json. Commit it so it's bundled in the app.
// Each run creates one anonymous test user in Supabase Auth (harmless).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FUNCTIONS } from '../../shared/src/api.ts';
import { PRESETS } from '../../shared/src/presets.ts';
import { PROFILE_FOR_CONDITION } from '../../shared/src/routing-profiles.ts';
import { SmartRouteResponseSchema } from '../../shared/src/smart-route-api.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = fs.readFileSync(path.join(root, 'app', '.env'), 'utf8');
const read = (key) => env.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim();
const url = read('EXPO_PUBLIC_SUPABASE_URL');
const key = read('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
if (!url || !key) throw new Error('app/.env is missing the Supabase URL or publishable key');

const day = process.argv[2] ?? '2026-10-24'; // pitch day
/** Shade and opening hours are for this time on that day (the explanation says "at 13:00"). */
const DEMO_TIME = '13:00';
// The demo trips (same as eval:routing), both ways, so either direction works offline.
const TRIPS = [
  ['kot-exit-a1', 'cityu-mmw'],
  ['kot-exit-c1', 'cityu-yeung'],
  ['kot-exit-c1', 'cityu-ac2'],
  ['festival-walk', 'cityu-ac3'],
  ['kot-exit-a1', 'cityu-student-residence'],
].flatMap(([a, b]) => [
  [a, b],
  [b, a],
]);
const CONDITIONS = ['normal', 'rain', 'heat'];

const signup = await fetch(`${url}/auth/v1/signup`, {
  method: 'POST',
  headers: { apikey: key, 'Content-Type': 'application/json' },
  body: '{}',
});
const session = await signup.json();
if (!session.access_token) throw new Error(`Anonymous sign-in failed (HTTP ${signup.status})`);

const point = (id) => PRESETS.find((p) => p.id === id).point;
const entries = [];
for (const [from, to] of TRIPS) {
  for (const condition of CONDITIONS) {
    const profile = PROFILE_FOR_CONDITION[condition]; // what the "Best now" tab asks for
    const res = await fetch(`${url}/functions/v1/${FUNCTIONS.smartRoute}`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        origin: point(from),
        destination: point(to),
        profile,
        condition,
        departure_time: `${day}T${DEMO_TIME}:00+08:00`,
      }),
    });
    const body = await res.json();
    const parsed = SmartRouteResponseSchema.safeParse(body);
    if (!res.ok || !parsed.success || parsed.data.status !== 'ok') {
      console.warn(`  ✗ ${from} → ${to} (${condition}): skipped`, res.status, body.error ?? '');
      continue;
    }
    entries.push({ from, to, condition, profile, response: parsed.data });
    console.log(`  ✓ ${from} → ${to} (${condition}): ${parsed.data.options.length} options`);
  }
}

const out = path.join(root, 'app', 'src', 'demo', 'smart-route-snapshot.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
// Coordinates to 6 decimals (~10 cm) keep the file small; the server sends full floats.
const rounded = JSON.stringify({ day, time: DEMO_TIME, entries }, (_key, value) =>
  typeof value === 'number' && !Number.isInteger(value) ? Math.round(value * 1e6) / 1e6 : value,
);
fs.writeFileSync(out, rounded);
console.log(
  `✓ ${entries.length} saved routes → ${path.relative(root, out)} (${Math.round(fs.statSync(out).size / 1024)} KB)`,
);
