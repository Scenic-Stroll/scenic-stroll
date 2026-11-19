// CORS rules for our Edge Functions: which web pages may call them (used by guard.ts).
// Kept separate from guard.ts so it can be tested without loading the Supabase server library.

export const CORS_BASE = {
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
};

/**
 * May a web page from `origin` call us? ALLOWED_ORIGINS is a comma-separated list such as
 * "https://scenicstroll.expo.app,https://*.scenicstroll.expo.app" (`*` = any subdomain, for preview
 * links). Not set yet → any origin (how it worked before the public launch). Local development
 * (localhost / 127.0.0.1, any port) is always allowed.
 */
export function originAllowed(origin: string, allowList: string | undefined): boolean {
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)) return true;
  if (!allowList?.trim()) return true;
  return allowList
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .some((pattern) => {
      const re = new RegExp(
        '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z0-9-]+') + '$',
        'i',
      );
      return re.test(origin);
    });
}
