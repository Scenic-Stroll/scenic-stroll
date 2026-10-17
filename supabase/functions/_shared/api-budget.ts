// Cost control for paid APIs (multimodal brief §7): reuse identical answers for a few minutes
// (public.api_cache) and stop at a daily cap of paid calls (public.api_calls). Both tables are
// server-only; `admin` must be the service-role client.
import type { SupabaseContext } from '@supabase/server';

type Admin = SupabaseContext['supabaseAdmin'];

/** Thrown when today's cap is reached; plan-trip then uses the free fallback. */
export class BudgetError extends Error {}

/** ±50 m: requests this close together count as the same trip. */
const round = (x: number) => (Math.round(x / 0.0005) * 0.0005).toFixed(4);

/** The cache key: mode, rounded start/end and the 5-minute bucket of the departure time. */
export function cacheKey(
  mode: string,
  o: { lat: number; lng: number },
  d: { lat: number; lng: number },
  departAt: Date,
): string {
  const bucket = Math.floor(departAt.getTime() / (5 * 60_000));
  return `${mode}:${round(o.lat)},${round(o.lng)}>${round(d.lat)},${round(d.lng)}@${bucket}`;
}

/** Midnight in Hong Kong (UTC+8) today, as an ISO time — the daily cap resets then. */
function hkMidnight(now: Date): string {
  const hk = new Date(now.getTime() + 8 * 3600_000);
  hk.setUTCHours(0, 0, 0, 0);
  return new Date(hk.getTime() - 8 * 3600_000).toISOString();
}

export async function budgetedCall<T>(
  admin: Admin,
  opts: { api: string; key: string; ttlS: number; dailyCap: number },
  call: () => Promise<T>,
): Promise<{ value: T; cached: boolean }> {
  const now = new Date();
  const { data: hit } = await admin
    .from('api_cache')
    .select('payload')
    .eq('key', opts.key)
    .gt('expires_at', now.toISOString())
    .maybeSingle();
  if (hit) return { value: hit.payload as T, cached: true };

  const { count } = await admin
    .from('api_calls')
    .select('id', { count: 'exact', head: true })
    .eq('api', opts.api)
    .gte('created_at', hkMidnight(now));
  if ((count ?? 0) >= opts.dailyCap) throw new BudgetError(`${opts.api}: daily cap reached`);

  try {
    const value = await call();
    await admin.from('api_calls').insert({ api: opts.api, ok: true });
    await admin.from('api_cache').upsert({
      key: opts.key,
      payload: value,
      expires_at: new Date(now.getTime() + opts.ttlS * 1000).toISOString(),
    });
    // Housekeeping: drop expired answers so the table stays small.
    await admin.from('api_cache').delete().lt('expires_at', now.toISOString());
    return { value, cached: false };
  } catch (err) {
    await admin.from('api_calls').insert({ api: opts.api, ok: false });
    throw err;
  }
}
