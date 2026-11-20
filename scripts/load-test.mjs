// Light load test of the live Edge Functions (web launch step 8, DECISIONS D48):
// 50 route requests at the same moment, then response times and status codes.
//
//   npm run load:test                                  (50 requests: smart-route + plan-route)
//   REQUESTS=10 ONLY=smart-route npm run load:test     (find the limit of one function)
//
// Free calls only: smart-route (our own walking graph) and plan-route (openrouteservice free tier,
// 2,000 a day). plan-trip is NOT called — it uses Google's paid APIs.
// Uses 5 anonymous accounts × 10 requests, so it stays inside our own rate limits (30 per user
// and 300 per IP address per minute) — this measures speed, not the limiter.
// Each run creates 5 anonymous users (harmless; Supabase allows 30 new ones per hour per IP).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FUNCTIONS } from '../shared/src/api.ts';
import { PRESETS } from '../shared/src/presets.ts';

const USERS = 5;
const REQUESTS = Number(process.env.REQUESTS ?? 50);
const ONLY = process.env.ONLY; // e.g. 'smart-route'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = fs.readFileSync(path.join(root, 'app', '.env'), 'utf8');
const read = (name) => env.match(new RegExp(`^${name}=(.+)$`, 'm'))?.[1]?.trim();
const url = read('EXPO_PUBLIC_SUPABASE_URL');
const key = read('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');

async function signIn() {
  const res = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const body = await res.json();
  if (!body.access_token) throw new Error(`sign-in failed (HTTP ${res.status})`);
  return body.access_token;
}

// Trips between the demo places, in both directions, so requests aren't all identical.
const places = PRESETS.map((p) => p.point);
const trip = (i) => ({
  origin: places[i % places.length],
  destination: places[(i * 7 + 3) % places.length],
});

async function timed(token, i) {
  const smart = ONLY ? ONLY === FUNCTIONS.smartRoute : i % 2 === 0;
  const name = smart ? FUNCTIONS.smartRoute : FUNCTIONS.planRoute;
  const body = smart ? { ...trip(i), profile: 'sheltered', condition: 'rain' } : trip(i);
  const started = performance.now();
  try {
    const res = await fetch(`${url}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    await res.text();
    return { name, status: res.status, ms: performance.now() - started };
  } catch {
    return { name, status: 'network error', ms: performance.now() - started };
  }
}

const percentile = (sorted, p) =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

const tokens = await Promise.all(Array.from({ length: USERS }, signIn));
console.log(`Signed in ${USERS} test users. Sending ${REQUESTS} requests at once…`);
const wall = performance.now();
const results = await Promise.all(
  Array.from({ length: REQUESTS }, (_, i) => timed(tokens[i % USERS], i)),
);
const wallMs = performance.now() - wall;

for (const name of [FUNCTIONS.smartRoute, FUNCTIONS.planRoute]) {
  const mine = results.filter((r) => r.name === name);
  if (mine.length === 0) continue;
  const ms = mine.map((r) => r.ms).sort((a, b) => a - b);
  const statuses = {};
  for (const r of mine) statuses[r.status] = (statuses[r.status] ?? 0) + 1;
  console.log(
    `${name.padEnd(12)} ${mine.length} requests · p50 ${Math.round(percentile(ms, 0.5))} ms · p95 ${Math.round(percentile(ms, 0.95))} ms · max ${Math.round(ms.at(-1))} ms · status ${JSON.stringify(statuses)}`,
  );
}
console.log(`All ${REQUESTS} answered in ${Math.round(wallMs)} ms.`);
console.log(
  'Cost: $0 — smart-route uses our own database; plan-route uses the openrouteservice free tier.',
);
