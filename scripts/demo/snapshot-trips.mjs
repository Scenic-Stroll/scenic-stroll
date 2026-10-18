// Saves live plan-trip answers (walk, MTR, car, taxi) for the demo trips into the app — demo
// safety for multimodal (brief: "seed the demo pairs' responses"). The app uses them ONLY when
// the live plan-trip call fails, and says "saved for the demo". Times are moved to "now" when
// shown; live departures are removed (they'd be stale).
//
// Run (online, when driving works — check the output):  npm run demo:trips
// Writes app/src/demo/trip-snapshot.json. Commit it. Creates one anonymous test user (harmless).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FUNCTIONS } from '../../shared/src/api.ts';
import { PRESETS } from '../../shared/src/presets.ts';
import { PlanTripResponseSchema } from '../../shared/src/trip-schema.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = fs.readFileSync(path.join(root, 'app', '.env'), 'utf8');
const read = (key) => env.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim();
const url = read('EXPO_PUBLIC_SUPABASE_URL');
const key = read('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
if (!url || !key) throw new Error('app/.env is missing the Supabase URL or publishable key');

const preset = (id) => PRESETS.find((p) => p.id === id).point;
const CITYU = preset('cityu-mmw');
// Same pairs as eval:multimodal (brief §8).
const PAIRS = [
  ['Exit A1 → CityU', preset('kot-exit-a1'), CITYU],
  ['CityU → Mong Kok', CITYU, { lat: 22.3193, lng: 114.1694 }],
  ['CityU → Tsim Sha Tsui', CITYU, { lat: 22.2973, lng: 114.1722 }],
  ['CityU → HKU', CITYU, { lat: 22.283, lng: 114.1371 }],
  ['CityU → CUHK', CITYU, { lat: 22.4196, lng: 114.2068 }],
];

const signup = await fetch(`${url}/auth/v1/signup`, {
  method: 'POST',
  headers: { apikey: key, 'Content-Type': 'application/json' },
  body: '{}',
});
const session = await signup.json();
if (!session.access_token) throw new Error(`Anonymous sign-in failed (HTTP ${signup.status})`);

// 5 decimals ≈ 1 m: plenty for drawing, and keeps the file (bundled in the app) small.
const round = (p) => ({ lat: Math.round(p.lat * 1e5) / 1e5, lng: Math.round(p.lng * 1e5) / 1e5 });

const entries = [];
for (const [name, from, to] of PAIRS) {
  const res = await fetch(`${url}/functions/v1/${FUNCTIONS.planTrip}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ origin: from, destination: to }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`${name}: plan-trip HTTP ${res.status}`);
  const plan = PlanTripResponseSchema.parse(await res.json());
  const missing = plan.unavailable.map((u) => u.mode);
  console.log(
    `${name}: ${plan.options.length} options${missing.length ? ` — missing ${missing.join(', ')}` : ''}`,
  );
  entries.push({
    name,
    from,
    to,
    response: {
      ...plan,
      options: plan.options.map((o) => ({
        ...o,
        eta_at: null,
        legs: o.legs.map(({ live_departures: _live, ...l }) => ({
          ...l,
          realtime: false,
          geometry: l.geometry.map(round),
        })),
      })),
      data_freshness: { traffic_at: null, eta_at: null },
    },
  });
}

const now = new Date(Date.now() + 8 * 3600_000).toISOString();
const out = path.join(root, 'app', 'src', 'demo', 'trip-snapshot.json');
fs.writeFileSync(
  out,
  JSON.stringify({ saved: `${now.slice(11, 16)} on ${now.slice(0, 10)}`, entries }),
);
console.log(`Wrote ${path.relative(root, out)} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
