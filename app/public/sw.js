// Scenic Stroll service worker: makes the web app open fast and work as an installed app.
// DECISIONS D45.
//
// What it saves on the device ("cache"):
//   * the app itself — the page, its JavaScript, fonts, images and icons from OUR site.
// What it never saves:
//   * live data: weather, routes, bus/MTR arrivals, friends' locations, map tiles. Those come from
//     other sites (Supabase, OpenFreeMap), and this worker doesn't touch other sites' requests.
//
// Strategies:
//   * Page loads (navigation): network first, so a new release shows up straight away. Offline →
//     the saved copy of the app (it shows its own "You're offline" banner), or offline.html if
//     the app was never saved on this device.
//   * Files under /_expo/static/ and /assets/: their names change whenever their content changes,
//     so a saved copy is always correct → cache first (fast).
//   * Other files from our site (icons, manifest, map worker): network first, saved copy offline.

// scripts/stamp-service-worker.mjs replaces this with a new id on every build, so each release
// gets a fresh cache and old ones are deleted.
const BUILD_ID = '__BUILD_ID__';
const CACHE = `scenic-stroll-${BUILD_ID}`;

// Saved when the worker installs, so the offline page can always be shown.
const PRECACHE = ['/', '/offline.html', '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      // Take over straight away: safe, because page loads always try the network first.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith('scenic-stroll-') && name !== CACHE)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Names that change with their content (hashed by Expo's build), so they never go stale. */
function isFingerprinted(url) {
  return url.pathname.startsWith('/_expo/static/') || url.pathname.startsWith('/assets/');
}

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(fallbackUrl ?? request, response.clone());
    return response;
  } catch {
    const saved = await cache.match(fallbackUrl ?? request);
    if (saved) return saved;
    if (request.mode === 'navigate') return cache.match('/offline.html');
    return Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Only our own site, only reading. Everything else (Supabase, map tiles, uploads) goes
  // straight to the network as if this worker didn't exist.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Every page of the app is the same single page (/, /route/123, /add/<code>, …), so it is
    // saved once under '/'.
    event.respondWith(networkFirst(request, '/'));
  } else if (isFingerprinted(url)) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(networkFirst(request));
  }
});
