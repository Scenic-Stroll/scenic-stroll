// POST /functions/v1/plan-route  { origin: {lat,lng}, destination: {lat,lng} }
// → { provider, distance_m, duration_s, coordinates: [{lat,lng}, ...] }
// The standard (grey) walking route. API keys stay here on the server.
//
// auth: 'user' → only signed-in app users (anonymous accounts count) can spend our routing quota.
import { withSupabase } from '@supabase/server';

import { errorResponse, json, readBody } from '../_shared/http.ts';
import { getRoutingProvider, ProviderError, routingHealth } from '../_shared/routing/index.ts';
import { PlanRouteRequestSchema, PlanRouteResponseSchema } from '../_shared/scenic/api.ts';

export default {
  fetch: withSupabase({ auth: 'user' }, async (req) => {
    // GET = health check for Settings → "Test backend" (reports secret NAMES only, never values).
    if (req.method === 'GET') {
      return json({ ok: true, function: 'plan-route', ...routingHealth((n) => Deno.env.get(n)) });
    }
    if (req.method !== 'POST') return errorResponse('Use POST', 405);

    const body = await readBody(req, PlanRouteRequestSchema);
    if ('response' in body) return body.response;

    try {
      const provider = getRoutingProvider((name) => Deno.env.get(name));
      const route = await provider.walk(body.data.origin, body.data.destination);
      // Validate our own output too, so a provider change can't silently break the app.
      return json(PlanRouteResponseSchema.parse(route));
    } catch (err) {
      console.error('plan-route failed:', err);
      if (err instanceof ProviderError) return errorResponse(err.message, 502);
      // Provider didn't answer within PROVIDER_TIMEOUT_MS (routing/types.ts).
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        return errorResponse('The routing service is slow to answer — try again in a minute', 504);
      }
      return errorResponse('Could not plan a route', 500);
    }
  }),
};
