// Turns on public/sw.js, which makes the web app open fast, installable and usable offline.
// Only in real builds: during development (`npm run web`) a worker would keep serving old code
// and hide your changes. DECISIONS D45.
export function registerServiceWorker(): void {
  if (__DEV__ || !('serviceWorker' in navigator)) return;
  const register = () =>
    navigator.serviceWorker.register('/sw.js').catch((err: unknown) => {
      // Not fatal: the app works without it, just not offline.
      console.warn('Service worker not registered', err);
    });
  // After the page has loaded, so it doesn't slow the first screen down.
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
