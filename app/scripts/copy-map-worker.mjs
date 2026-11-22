// Copies MapLibre's background worker into app/public/, which Expo publishes with the web app.
// MapLibre normally finds the worker next to its own script, but Metro bundles MapLibre into our
// code, so the file must be served separately (web-map/map-view.tsx points MapLibre at it).
// Runs before every web start/build, so the copy always matches the installed MapLibre version.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(appDir, 'package.json'));
const pkg = require.resolve('maplibre-gl/package.json');
const source = path.join(path.dirname(pkg), 'dist', 'maplibre-gl-worker.mjs');
const target = path.join(appDir, 'public', 'maplibre-gl-worker.mjs');

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(source, target);
console.log(`Map worker copied to ${path.relative(appDir, target)}`);
