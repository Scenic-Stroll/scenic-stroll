// End-to-end routing test, exactly like the app does it:
//   1. sign in anonymously (needs "Anonymous sign-ins" ON in the Supabase dashboard)
//   2. call plan-route: Kowloon Tong Exit A1 → Mong Man-wai Building
// Run: npm run smoke:routing
// Note: each run creates one anonymous test user in Supabase Auth (harmless; delete in the dashboard).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FUNCTIONS } from '../shared/src/api.ts';
import { PRESETS } from '../shared/src/presets.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = fs.readFileSync(path.join(root, 'app', '.env'), 'utf8');
const read = (key) => env.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim();
const url = read('EXPO_PUBLIC_SUPABASE_URL');
const key = read('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
if (!url || !key) {
  console.error('✗ app/.env is missing the Supabase URL or publishable key');
  process.exit(1);
}

const point = (id) => PRESETS.find((p) => p.id === id).point;
const origin = point('kot-exit-a1');
const destination = point('cityu-mmw');

// 1. Anonymous sign-in (same call supabase.auth.signInAnonymously() makes).
const signup = await fetch(`${url}/auth/v1/signup`, {
  method: 'POST',
  headers: { apikey: key, 'Content-Type': 'application/json' },
  body: JSON.stringify({}),
});
const session = await signup.json();
if (!signup.ok || !session.access_token) {
  console.error(
    `✗ Anonymous sign-in failed (HTTP ${signup.status}): ${session.msg ?? session.message ?? JSON.stringify(session)}`,
  );
  console.error(
    '  → Supabase dashboard → Authentication → Sign In / Providers → Anonymous sign-ins: ON',
  );
  process.exit(1);
}
console.log('✓ Signed in anonymously');

const call = (name, init) =>
  fetch(`${url}/functions/v1/${name}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
  });

// 2. Health check: is the routing key set on the server?
const health = await (await call(FUNCTIONS.planRoute, { method: 'GET' })).json();
if (health.missingSecrets?.length) {
  console.error(
    `✗ plan-route is deployed but missing secret(s): ${health.missingSecrets.join(', ')}`,
  );
  console.error('  → npx supabase secrets set ORS_API_KEY=<your key> --project-ref <ref>');
  process.exit(1);
}
console.log(`✓ plan-route is healthy (provider: ${health.provider})`);

// 3. A real route.
const res = await call(FUNCTIONS.planRoute, {
  method: 'POST',
  body: JSON.stringify({ origin, destination }),
});
const route = await res.json();
if (!res.ok) {
  console.error(`✗ plan-route failed (HTTP ${res.status}): ${route.error ?? route.message}`);
  process.exit(1);
}
console.log(
  `✓ Route Exit A1 → MMW: ${Math.round(route.distance_m)} m, ${Math.round(route.duration_s / 60)} min, ${route.coordinates.length} points (${route.provider})`,
);
