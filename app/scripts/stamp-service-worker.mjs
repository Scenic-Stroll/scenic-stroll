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

// The page lists the hashed JavaScript files, so its hash changes whenever the app changes;
// sw.js is included too, for releases that only change the service worker.
const sw = fs.readFileSync(swPath, 'utf8');
const buildId = createHash('sha256').update(page).update(sw).digest('hex').slice(0, 12);
if (!sw.includes('__BUILD_ID__')) {
  console.error('stamp-service-worker: dist/sw.js has no __BUILD_ID__ placeholder');
  process.exit(1);
}

// Every JavaScript/CSS file of the build, plus the icon font the app uses, as site paths
// ("/_expo/static/js/web/entry-….js"). The worker saves them all when it installs.
const listFiles = (dir) =>
  fs.readdirSync(dir, { recursive: true }).map((f) => path.join(dir, String(f)));
const buildFiles = [
  ...listFiles(path.join(dist, '_expo', 'static')).filter((f) => /\.(js|css)$/.test(f)),
  ...listFiles(path.join(dist, 'assets')).filter((f) =>
    /MaterialCommunityIcons\.[0-9a-f]+\.ttf$/.test(f),
  ),
].map((f) => '/' + path.relative(dist, f).split(path.sep).join('/'));

const stamped = sw
  .replace('__BUILD_ID__', buildId)
  .replace('/*__BUILD_FILES__*/ []', JSON.stringify(buildFiles));
fs.writeFileSync(swPath, stamped);
console.log(
  `stamp-service-worker: dist/sw.js build ${buildId}, ${buildFiles.length} files to save`,
);
