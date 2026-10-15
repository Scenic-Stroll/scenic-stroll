// POST /functions/v1/conditions  {} → { temp_c, uv_index, warnings, sun, mode, stale, source, ... }
// Live walking conditions around CityU: Hong Kong Observatory weather + warnings + sun position.
// HKO answers are cached in public.conditions_cache, so HKO is asked at most every 5–10 minutes,
// and if HKO is down we serve the last good answer (stale) or time-of-day defaults. Never fails.
//
// auth: 'user' → only signed-in app users (anonymous accounts count), like our other functions.
import { withSupabase } from '@supabase/server';

import { errorResponse, json } from '../_shared/http.ts';
import {
  ConditionsSchema,
  defaultConditions,
  getConditions,
  HKO_FEED_URLS,
} from '../_shared/scenic/conditions.ts';

/** Don't let a slow HKO hold up the app: give up after 5 s and use the cache. */
const HKO_TIMEOUT_MS = 5_000;

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    // GET = health check for Settings → "Test backend". HKO needs no key, so no secrets to report.
    if (req.method === 'GET') {
      return json({ ok: true, function: 'conditions', provider: 'hko', missingSecrets: [] });
    }
    if (req.method !== 'POST') return errorResponse('Use POST', 405);

    try {
      const conditions = await getConditions({
        now: new Date(),
        fetchFeed: async (feed) => {
          const res = await fetch(HKO_FEED_URLS[feed], {
            signal: AbortSignal.timeout(HKO_TIMEOUT_MS),
          });
          if (!res.ok) throw new Error(`HKO ${feed} HTTP ${res.status}`);
          return await res.json();
        },
        // The cache table is closed to app users, so it is read with the admin client.
        readCache: async (feed) => {
          const { data, error } = await ctx.supabaseAdmin
            .from('conditions_cache')
            .select('payload, fetched_at')
            .eq('feed', feed)
            .maybeSingle();
          if (error) throw error;
          return data ? { payload: data.payload, fetchedAt: new Date(data.fetched_at) } : null;
        },
        writeCache: async (feed, payload, fetchedAt) => {
          const { error } = await ctx.supabaseAdmin
            .from('conditions_cache')
            .upsert({ feed, payload, fetched_at: fetchedAt.toISOString() });
          if (error) console.error('conditions cache write failed:', error.message);
        },
      });
      if (conditions.source !== 'hko') console.warn(`conditions: serving ${conditions.source}`);
      return json(ConditionsSchema.parse(conditions));
    } catch (err) {
      // getConditions doesn't throw, but if anything unexpected does, still answer something useful.
      console.error('conditions failed:', err);
      return json(defaultConditions(new Date()));
    }
  }),
};
