// Live walking conditions for Edge Functions: HKO weather through public.conditions_cache.
// Used by `conditions` (the "Now" card) and `smart-route` ("Best now"), so both see the same
// weather and HKO is asked at most every 5–10 minutes in total. Never throws.
import type { SupabaseContext } from '@supabase/server';

import { getConditions, HKO_FEED_URLS, type Conditions } from './scenic/conditions.ts';

/** Don't let a slow HKO hold up a request: give up after 5 s and use the cache. */
const HKO_TIMEOUT_MS = 5_000;

/** `admin` must be the service-role client: the cache table is closed to app users. */
export function loadConditions(admin: SupabaseContext['supabaseAdmin']): Promise<Conditions> {
  return getConditions({
    now: new Date(),
    fetchFeed: async (feed) => {
      const res = await fetch(HKO_FEED_URLS[feed], { signal: AbortSignal.timeout(HKO_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HKO ${feed} HTTP ${res.status}`);
      return await res.json();
    },
    readCache: async (feed) => {
      const { data, error } = await admin
        .from('conditions_cache')
        .select('payload, fetched_at')
        .eq('feed', feed)
        .maybeSingle();
      if (error) throw error;
      return data ? { payload: data.payload, fetchedAt: new Date(data.fetched_at) } : null;
    },
    writeCache: async (feed, payload, fetchedAt) => {
      const { error } = await admin
        .from('conditions_cache')
        .upsert({ feed, payload, fetched_at: fetchedAt.toISOString() });
      if (error) console.error('conditions cache write failed:', error.message);
    },
  });
}
