// Sends a crash in an Edge Function to Sentry (DECISIONS D47). Off unless the SENTRY_DSN secret
// is set. Hand-written instead of Sentry's SDK: one small HTTP request keeps every function quick
// to start, and you can read exactly what is sent. Personal data is scrubbed first (no coordinates,
// query strings or ids; no IP address or user id at all).
import { scrubText } from './scenic/privacy.ts';

type Dsn = { endpoint: string; publicKey: string };

/** "https://<key>@o123.ingest.sentry.io/456" → where to send reports, or null if it isn't a DSN. */
export function parseDsn(dsn: string | undefined): Dsn | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, '');
    if (!url.username || !/^\d+$/.test(projectId)) return null;
    return {
      endpoint: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
      publicKey: url.username,
    };
  } catch {
    return null;
  }
}

/** The report in Sentry's "envelope" format: three JSON lines. */
export function buildEnvelope(fn: string, err: unknown, now = new Date()): string {
  const error = err instanceof Error ? err : new Error(String(err));
  const eventId = crypto.randomUUID().replaceAll('-', '');
  const event = {
    event_id: eventId,
    timestamp: now.getTime() / 1000,
    platform: 'javascript',
    level: 'error',
    environment: 'production',
    tags: { function: fn },
    exception: { values: [{ type: error.name, value: scrubText(error.message) }] },
    extra: { stack: error.stack ? scrubText(error.stack) : undefined },
  };
  return [
    JSON.stringify({ event_id: eventId, sent_at: now.toISOString() }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify(event),
  ].join('\n');
}

/** Never throws, and gives up after 2 s: reporting must not make the answer slower or fail. */
export async function reportError(fn: string, err: unknown): Promise<void> {
  const dsn = parseDsn(Deno.env.get('SENTRY_DSN'));
  if (!dsn) return;
  try {
    await fetch(dsn.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=scenic-edge/1.0`,
      },
      body: buildEnvelope(fn, err),
      signal: AbortSignal.timeout(2000),
    });
  } catch (reportErr) {
    console.warn('error report not sent', reportErr);
  }
}
