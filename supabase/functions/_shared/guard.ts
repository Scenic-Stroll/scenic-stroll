// Every Edge Function goes through `guarded(...)`: sign-in check (withSupabase), then
//   * CORS: browsers may call us only from our own sites (ALLOWED_ORIGINS secret) and localhost;
//   * rate limits: requests per minute per user AND per IP address (counted in Postgres by
//     public.rate_limit_hit, so they hold across all running copies of the function).
// Phones and scripts send no Origin header, so CORS never blocks them; the rate limits still apply.
// Health checks (GET, used by Profile → Diagnostics) are free. DECISIONS D44.
// A crash inside a function is reported to Sentry (error-report.ts, D47) and answered with a 500.
import { type SupabaseContext, withSupabase } from '@supabase/server';

import { CORS_BASE, originAllowed } from './cors.ts';
import { reportError } from './error-report.ts';
import { errorResponse } from './http.ts';

/** Requests per minute. Per-IP limits are generous: a whole campus can share one IP address. */
export type Limits = { perUser: number; perIp: number };

export const LIMITS = {
  conditions: { perUser: 30, perIp: 600 },
  eta: { perUser: 60, perIp: 600 },
  geocode: { perUser: 30, perIp: 300 },
  planRoute: { perUser: 30, perIp: 300 },
  planTrip: { perUser: 20, perIp: 200 }, // calls paid APIs
  smartRoute: { perUser: 30, perIp: 300 },
  pinTools: { perUser: 30, perIp: 120 },
  generatePinVersions: { perUser: 5, perIp: 30 }, // calls a paid LLM
} satisfies Record<string, Limits>;

const WINDOW_S = 60;

/** The caller's IP as seen by Supabase's edge (first address in X-Forwarded-For). */
function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

/** True if this request is over a limit. Counting errors let the request through (fail open). */
async function overLimit(
  req: Request,
  ctx: SupabaseContext,
  name: string,
  limits: Limits,
): Promise<boolean> {
  const user = ctx.userClaims?.id ?? 'none';
  const { data, error } = await ctx.supabaseAdmin.rpc('rate_limit_hit', {
    p_buckets: [`${name}:user:${user}`, `${name}:ip:${clientIp(req)}`],
    p_limits: [limits.perUser, limits.perIp],
    p_window_s: WINDOW_S,
  });
  if (error) {
    console.error(`${name}: rate limit check failed, letting the request through`, error.message);
    return false;
  }
  if (data !== 0) console.warn(`${name}: rate limited (${data === 1 ? 'user' : 'ip'})`);
  return data !== 0;
}

type Handler = (req: Request, ctx: SupabaseContext) => Promise<Response>;

export function guarded(name: string, limits: Limits, handler: Handler) {
  const inner = withSupabase({ auth: 'user', cors: 'disabled' }, async (req, ctx) => {
    if (req.method !== 'GET' && (await overLimit(req, ctx, name, limits))) {
      const res = errorResponse('Too many requests — wait a minute and try again.', 429);
      res.headers.set('Retry-After', String(WINDOW_S));
      return res;
    }
    try {
      return await handler(req, ctx);
    } catch (err) {
      console.error(`${name}: crashed`, err);
      await reportError(name, err);
      return errorResponse('Something went wrong on our side. Please try again.', 500);
    }
  });

  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('origin');
    const allowed = origin === null || originAllowed(origin, Deno.env.get('ALLOWED_ORIGINS'));
    const cors: Record<string, string> =
      origin && allowed ? { ...CORS_BASE, 'Access-Control-Allow-Origin': origin } : {};

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: allowed ? 204 : 403, headers: cors });
    }
    if (!allowed) return errorResponse('This website may not use the Scenic Stroll API.', 403);

    const res = await inner(req);
    // Copy the response so we can add headers (some responses have immutable headers).
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  };
}
