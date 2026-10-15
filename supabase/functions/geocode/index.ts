// POST /functions/v1/geocode  { text: "Festival Walk" } → { results: [{ label, point }] }
// Free-text place search, biased to the CityU / Kowloon Tong demo area.
//
// auth: 'user' → only signed-in app users (anonymous accounts count) can spend our geocoding quota.
import { withSupabase } from '@supabase/server';

import { errorResponse, json, readBody } from '../_shared/http.ts';
import { getRoutingProvider, ProviderError, routingHealth } from '../_shared/routing/index.ts';
import { GeocodeRequestSchema, GeocodeResponseSchema } from '../_shared/scenic/api.ts';

export default {
  fetch: withSupabase({ auth: 'user' }, async (req) => {
    // GET = health check for Settings → "Test backend" (reports secret NAMES only, never values).
    if (req.method === 'GET') {
      return json({ ok: true, function: 'geocode', ...routingHealth((n) => Deno.env.get(n)) });
    }
    if (req.method !== 'POST') return errorResponse('Use POST', 405);

    const body = await readBody(req, GeocodeRequestSchema);
    if ('response' in body) return body.response;

    try {
      const provider = getRoutingProvider((name) => Deno.env.get(name));
      const results = await provider.geocode(body.data.text);
      return json(GeocodeResponseSchema.parse({ results }));
    } catch (err) {
      console.error('geocode failed:', err);
      if (err instanceof ProviderError) return errorResponse(err.message, 502);
      return errorResponse('Could not search places', 500);
    }
  }),
};
