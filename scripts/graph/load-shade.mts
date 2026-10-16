// Uploads scripts/graph/data/shade.json (from npm run graph:shade) onto the ACTIVE walking graph.
// Shade can be refreshed any day without rebuilding the graph (e.g. the day before the pitch).
// Run: GRAPH_LOADER_KEY=<key from npm run graph:key> npm run graph:load-shade
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const env = fs.readFileSync(path.join(root, 'app', '.env'), 'utf8');
const read = (k: string) => env.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim();
const url = read('EXPO_PUBLIC_SUPABASE_URL');
const publishableKey = read('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
const loaderKey = process.env.GRAPH_LOADER_KEY;
if (!url || !publishableKey)
  throw new Error('app/.env is missing the Supabase URL or publishable key');
if (!loaderKey) throw new Error('Set GRAPH_LOADER_KEY (get one with: npm run graph:key)');

const shade = JSON.parse(fs.readFileSync(path.join(here, 'data', 'shade.json'), 'utf8')) as {
  date: string;
  firstMin: number;
  bucketMin: number;
  edges: [number, number[], number][];
};

const signup = await fetch(`${url}/auth/v1/signup`, {
  method: 'POST',
  headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
  body: '{}',
});
const session = (await signup.json()) as { access_token?: string };
if (!session.access_token) throw new Error(`Anonymous sign-in failed (HTTP ${signup.status})`);
const headers = {
  apikey: publishableKey,
  Authorization: `Bearer ${session.access_token}`,
  'Content-Type': 'application/json',
};

// Which build is live, and does our shade file match it (same number of edges)?
const builds = (await (
  await fetch(`${url}/rest/v1/graph_builds?select=id,edge_count&status=eq.active`, { headers })
).json()) as { id: number; edge_count: number }[];
const active = builds[0];
if (!active) throw new Error('No active walking graph — run npm run graph:load first');
if (active.edge_count !== shade.edges.length) {
  throw new Error(
    `shade.json has ${shade.edges.length} edges but the live graph has ${active.edge_count}. ` +
      'Rebuild shade from the same graph.json that was loaded (npm run graph:shade).',
  );
}

console.log(`Uploading shade for ${shade.date} onto build ${active.id}…`);
let updated = 0;
const BATCH = 2000;
for (let i = 0; i < shade.edges.length; i += BATCH) {
  const res = await fetch(`${url}/rest/v1/rpc/graph_set_shade`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      p_key: loaderKey,
      p_build_id: active.id,
      p_date: shade.date,
      p_first_min: shade.firstMin,
      p_bucket_min: shade.bucketMin,
      p_rows: shade.edges.slice(i, i + BATCH),
    }),
  });
  const body = await res.json();
  if (!res.ok)
    throw new Error(
      `graph_set_shade failed (HTTP ${res.status}): ${body.message ?? JSON.stringify(body)}`,
    );
  updated += body as number;
  console.log(`  ${Math.min(i + BATCH, shade.edges.length)}/${shade.edges.length}`);
}
console.log(`✓ Shade for ${shade.date} set on ${updated} edges of build ${active.id}`);
