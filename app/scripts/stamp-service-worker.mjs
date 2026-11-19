// Runs after `expo export --platform web`. Gives dist/sw.js a new BUILD_ID (a hash of the built
// page), so every release uses a fresh cache and the service worker deletes the old one.
// Without this, phones could keep yesterday's app. See public/sw.js and DECISIONS D45.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const swPath = path.join(dist, 'sw.js');
const page = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');

// The page lists the hashed JavaScript files, so its hash changes whenever the app changes.
const buildId = createHash('sha256').update(page).digest('hex').slice(0, 12);
const sw = fs.readFileSync(swPath, 'utf8');
if (!sw.includes('__BUILD_ID__')) {
  console.error('stamp-service-worker: dist/sw.js has no __BUILD_ID__ placeholder');
  process.exit(1);
}
fs.writeFileSync(swPath, sw.replace('__BUILD_ID__', buildId));
console.log(`stamp-service-worker: dist/sw.js build ${buildId}`);
