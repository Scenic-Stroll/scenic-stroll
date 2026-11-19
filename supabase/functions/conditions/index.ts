// POST /functions/v1/conditions  {} → { temp_c, uv_index, warnings, sun, mode, stale, source, ... }
// Live walking conditions around CityU: Hong Kong Observatory weather + warnings + sun position.
// HKO answers are cached in public.conditions_cache (see _shared/conditions-service.ts), so HKO is
// asked at most every 5–10 minutes; if HKO is down we serve the last good answer or time-of-day
// defaults. Never fails.
//
// auth: 'user' → only signed-in app users (anonymous accounts count), like our other functions.

import { guarded, LIMITS } from '../_shared/guard.ts';
import { loadConditions } from '../_shared/conditions-service.ts';
import { errorResponse, json } from '../_shared/http.ts';
import { ConditionsSchema, defaultConditions } from '../_shared/scenic/conditions.ts';

export default {
  fetch: guarded('conditions', LIMITS.conditions, async (req, ctx) => {
    // GET = health check for Settings → "Test backend". HKO needs no key, so no secrets to report.
    if (req.method === 'GET') {
      return json({ ok: true, function: 'conditions', provider: 'hko', missingSecrets: [] });
    }
    if (req.method !== 'POST') return errorResponse('Use POST', 405);

    try {
      const conditions = await loadConditions(ctx.supabaseAdmin);
      if (conditions.source !== 'hko') console.warn(`conditions: serving ${conditions.source}`);
      return json(ConditionsSchema.parse(conditions));
    } catch (err) {
      // loadConditions doesn't throw, but if anything unexpected does, still answer something useful.
      console.error('conditions failed:', err);
      return json(defaultConditions(new Date()));
    }
  }),
};
