// POST /functions/v1/eta  { stop_id: "kmb:6652A2FE695AD8C2" | "mtr:KOT" | ... }
// → { stop_id, status: 'live' | 'unavailable', arrivals: StopArrival[], fetched_at }
// Live arrivals for one stop (multimodal step 3), for the map's stop cards. A thin cached proxy:
// MTR Next Train, KMB/LWB, Citybus and green minibus real-time APIs (all DATA.GOV.HK, no keys).
// Answers are cached 30 s (see _shared/eta-fetch.ts). If the operator doesn't answer we say so
// ('unavailable') rather than fail: the app then shows "live times unavailable".
//
// auth: 'user' → only signed-in app users (anonymous accounts count), like our other functions.
import { withSupabase } from '@supabase/server';

import { stopEta } from '../_shared/eta-fetch.ts';
import { errorResponse, json, readBody } from '../_shared/http.ts';
import {
  StopEtaRequestSchema,
  StopEtaResponseSchema,
} from '../_shared/scenic/transit/eta-schema.ts';

/** Stop cards refresh every 30 s; an operator slower than this is treated as down. */
const TIMEOUT_MS = 4_000;

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    // GET = health check for Settings → "Test backend". The operators' APIs need no keys.
    if (req.method === 'GET') {
      return json({ ok: true, function: 'eta', provider: 'data.gov.hk', missingSecrets: [] });
    }
    if (req.method !== 'POST') return errorResponse('Use POST', 405);

    const body = await readBody(req, StopEtaRequestSchema);
    if ('response' in body) return body.response;
    const eta = await stopEta(
      ctx.supabaseAdmin,
      body.data.stop_id,
      AbortSignal.timeout(TIMEOUT_MS),
    );
    if (!eta) return errorResponse('Unknown stop', 404);
    return json(StopEtaResponseSchema.parse(eta));
  }),
};
