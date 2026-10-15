// Verifies every Edge Function the app calls exists in the repo AND is deployed.
// Run: npm run check:functions          (add --offline to skip the deployment check)
//
// Why: the app once showed "Requested function was not found" because plan-route was written
// but never deployed. This script makes that impossible to miss.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Node 22.18+/24 runs TypeScript files directly (type stripping), so we read the real constant.
import { FUNCTIONS } from '../shared/src/api.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const offline = process.argv.includes('--offline');
const names = Object.values(FUNCTIONS);
const problems = [];
const ok = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg) => {
  problems.push(msg);
  console.log(`  ✗ ${msg}`);
};

// 1. The app must call functions through FUNCTIONS, never a hand-typed string.
console.log('App code:');
const appFiles = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(entry.name)) appFiles.push(p);
  }
};
walk(path.join(root, 'app', 'src'));
let literalCalls = 0;
for (const file of appFiles) {
  const code = fs.readFileSync(file, 'utf8');
  for (const m of code.matchAll(/functions\.invoke\(\s*['"`]([^'"`]+)['"`]/g)) {
    literalCalls++;
    fail(
      `${path.relative(root, file)} calls "${m[1]}" by string — use FUNCTIONS from @scenic/shared`,
    );
  }
}
if (literalCalls === 0) ok('all calls use the FUNCTIONS constant');

// 2. Each function exists in the repo and in config.toml.
console.log('Repository:');
const toml = fs.readFileSync(path.join(root, 'supabase', 'config.toml'), 'utf8');
for (const name of names) {
  const dir = path.join(root, 'supabase', 'functions', name);
  if (!fs.existsSync(path.join(dir, 'index.ts')))
    fail(`supabase/functions/${name}/index.ts is missing`);
  else if (!fs.existsSync(path.join(dir, 'deno.json')))
    fail(`supabase/functions/${name}/deno.json is missing`);
  else if (!toml.includes(`[functions.${name}]`))
    fail(`supabase/config.toml has no [functions.${name}] block`);
  else ok(`${name} (folder + config)`);
}

// 3. Each function is deployed on the project the app uses.
console.log('Deployed on Supabase:');
if (offline) {
  console.log('  – skipped (--offline)');
} else {
  const env = fs.readFileSync(path.join(root, 'app', '.env'), 'utf8');
  const read = (key) => env.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim();
  const url = read('EXPO_PUBLIC_SUPABASE_URL');
  const key = read('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  if (!url || !key) {
    fail('app/.env is missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  } else {
    for (const name of names) {
      try {
        // No user token on purpose: a deployed function answers 401 (auth required),
        // a missing one answers 404 NOT_FOUND.
        const res = await fetch(`${url}/functions/v1/${name}`, { headers: { apikey: key } });
        const body = await res.text();
        if (res.status === 404 && body.includes('NOT_FOUND')) {
          fail(`${name} is NOT deployed → npm run deploy:functions`);
        } else if (res.status === 401 || res.ok) {
          ok(`${name} (HTTP ${res.status})`);
        } else {
          fail(`${name} answered HTTP ${res.status}: ${body.slice(0, 120)}`);
        }
      } catch (err) {
        fail(`${name}: could not reach ${url} (${err.message})`);
      }
    }
  }
}

if (problems.length > 0) {
  console.log(`\n${problems.length} problem(s) found.`);
  process.exit(1);
}
console.log('\nAll functions OK.');
