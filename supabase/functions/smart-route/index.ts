// POST /functions/v1/smart-route  { origin, destination, profile?, departure_time?, condition? }
// → { status, condition, best_profile, options: [{ coordinates, duration_s, pct_covered, steps, … }] }
// Our own computed routes on the walking graph (Lands Department 3D Pedestrian Network): fastest,
// the profile the user picked, and "Best now" for the weather. Deterministic — no language model.
// Anything but status "ok" (or an error) means: the app shows the standard route instead.
//
// auth: 'user' → only signed-in app users (anonymous accounts count), like our other functions.
import { withSupabase } from '@supabase/server';

import { loadConditions } from '../_shared/conditions-service.ts';
import { loadTripGraph } from '../_shared/graph-loader.ts';
import { errorResponse, json, readBody } from '../_shared/http.ts';
import { isInGraphArea } from '../_shared/scenic/graph-area.ts';
import { planSmartRoutes } from '../_shared/scenic/smart-route.ts';
import {
  SmartRouteRequestSchema,
  SmartRouteResponseSchema,
} from '../_shared/scenic/smart-route-api.ts';

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    // GET = health check for Settings → "Test backend". No API keys needed.
    if (req.method === 'GET') {
      return json({
        ok: true,
        function: 'smart-route',
        provider: 'walking-graph',
        missingSecrets: [],
      });
    }
    if (req.method !== 'POST') return errorResponse('Use POST', 405);

    const body = await readBody(req, SmartRouteRequestSchema);
    if ('response' in body) return body.response;
    const q = body.data;

    try {
      const started = Date.now();
      const inArea = isInGraphArea(q.origin) && isInGraphArea(q.destination);
      const [graph, condition] = await Promise.all([
        // Outside our area there's nothing to load (the planner answers "outside_area").
        inArea ? loadTripGraph(ctx.supabase, q.origin, q.destination) : Promise.resolve(null),
        // The app's choice (the "Now" card or demo simulation) wins over live weather.
        q.condition
          ? Promise.resolve(q.condition)
          : loadConditions(ctx.supabaseAdmin).then((c) => c.mode),
      ]);
      const result = planSmartRoutes(graph, {
        origin: q.origin,
        destination: q.destination,
        profile: q.profile,
        departure: q.departure_time ? new Date(q.departure_time) : new Date(),
        condition,
        conditionSource: q.condition ? 'given' : 'live',
      });
      console.log(
        `smart-route ${result.status}, ${result.options.length} options, ${Date.now() - started} ms`,
      );
      return json(SmartRouteResponseSchema.parse(result));
    } catch (err) {
      console.error('smart-route failed:', err);
      return errorResponse('Could not compute smart routes', 500);
    }
  }),
};
