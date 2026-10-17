// POST /functions/v1/plan-trip  { origin, destination, depart_at?, modes?, condition? }
// → { options: TripOption[] (best for you first), unavailable, condition, data_freshness }
// Multimodal step 1: walk + car, in one comparable shape (shared/src/trip-schema.ts).
//   * walk: our own computed routes (the smart-route function — shade, cover, step-free) inside the
//     walking graph's area; the standard street walk elsewhere
//   * car: Google Routes with live traffic when GOOGLE_ROUTES_API_KEY is set (cached 3 min, daily
//     cap), else OpenRouteService with typical times
// Each part has its own fallback and a time limit; a failed mode is listed in `unavailable`, never
// an error. No language model anywhere in here.
//
// auth: 'user' → only signed-in app users (anonymous accounts count) can spend our routing quota.
import { withSupabase } from '@supabase/server';

import { budgetedCall, BudgetError, cacheKey } from '../_shared/api-budget.ts';
import { googleDrive, orsDrive } from '../_shared/drive.ts';
import { errorResponse, json, readBody } from '../_shared/http.ts';
import { getRoutingProvider } from '../_shared/routing/index.ts';
import type { ConditionMode } from '../_shared/scenic/conditions.ts';
import { PROFILE_FOR_CONDITION } from '../_shared/scenic/routing-profiles.ts';
import { SmartRouteResponseSchema } from '../_shared/scenic/smart-route-api.ts';
import {
  carTripsFromDrive,
  rankTrips,
  walkTripFromSmart,
  walkTripFromStandard,
} from '../_shared/scenic/trip-plan.ts';
import {
  PlanTripRequestSchema,
  PlanTripResponseSchema,
  type TripOption,
} from '../_shared/scenic/trip-schema.ts';

/** The whole request should answer within ~4 s (brief); each part gets this long. */
const PART_TIMEOUT_MS = 4_000;
/** Paid Google calls per day before we fall back to the free provider. Override with the secret. */
const DEFAULT_GOOGLE_DAILY_CAP = 300;

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const env = (name: string) => Deno.env.get(name);
    // GET = health check for Settings → "Test backend" (secret NAMES only, never values).
    if (req.method === 'GET') {
      return json({
        ok: true,
        function: 'plan-trip',
        // Google is optional: without it cars use typical times instead of live traffic.
        provider: env('GOOGLE_ROUTES_API_KEY') ? 'google-live-traffic' : 'ors-typical-traffic',
        missingSecrets: env('ORS_API_KEY') ? [] : ['ORS_API_KEY'],
      });
    }
    if (req.method !== 'POST') return errorResponse('Use POST', 405);

    const body = await readBody(req, PlanTripRequestSchema);
    if ('response' in body) return body.response;
    const q = body.data;
    const departAt = q.depart_at ? new Date(q.depart_at) : new Date();
    const started = Date.now();
    const unavailable: { mode: TripOption['mode']; reason: string }[] = [];

    // ---- walk ------------------------------------------------------------------------------
    // Asks our smart-route function (same user, same token) so walking logic lives in one place.
    const walk = async (): Promise<{ trips: TripOption[]; condition: ConditionMode | null }> => {
      try {
        const res = await fetch(`${env('SUPABASE_URL')}/functions/v1/smart-route`, {
          method: 'POST',
          signal: AbortSignal.timeout(PART_TIMEOUT_MS),
          headers: {
            Authorization: req.headers.get('Authorization') ?? '',
            apikey: req.headers.get('apikey') ?? '',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            origin: q.origin,
            destination: q.destination,
            // With a known condition ask for its best profile; else smart-route adds "Best now".
            profile: q.condition ? PROFILE_FOR_CONDITION[q.condition] : 'fastest',
            condition: q.condition,
            departure_time: departAt.toISOString(),
          }),
        });
        const smart = SmartRouteResponseSchema.parse(await res.json());
        if (smart.status === 'ok') {
          // The route for the weather, plus the quickest walk if it's a different one.
          const picked = smart.options.filter(
            (o) => o.roles.includes('best_now') || o.roles.includes('fastest'),
          );
          return {
            trips: picked.map((o) => walkTripFromSmart(o, departAt)),
            condition: smart.condition,
          };
        }
      } catch (err) {
        console.warn('plan-trip: smart walk failed, using the standard walk', err);
      }
      // Outside our walking graph (or it failed): the standard street walk.
      const standard = await getRoutingProvider(env).walk(q.origin, q.destination);
      return { trips: [walkTripFromStandard(standard, departAt)], condition: null };
    };

    // ---- car -------------------------------------------------------------------------------
    const car = async (): Promise<{ trips: TripOption[]; live: boolean }> => {
      const googleKey = env('GOOGLE_ROUTES_API_KEY');
      const admin = ctx.supabaseAdmin;
      if (googleKey) {
        try {
          const { value } = await budgetedCall(
            admin,
            {
              api: 'google_routes_drive',
              key: cacheKey('drive', q.origin, q.destination, departAt),
              ttlS: 180,
              dailyCap: Number(env('GOOGLE_DAILY_CAP')) || DEFAULT_GOOGLE_DAILY_CAP,
            },
            () =>
              googleDrive(
                googleKey,
                q.origin,
                q.destination,
                departAt,
                AbortSignal.timeout(PART_TIMEOUT_MS),
              ),
          );
          return { trips: carTripsFromDrive(value, departAt, 'google'), live: true };
        } catch (err) {
          console.warn(
            err instanceof BudgetError ? err.message : 'plan-trip: Google drive failed',
            err,
          );
        }
      }
      const orsKey = env('ORS_API_KEY');
      if (!orsKey) throw new Error('No driving provider configured');
      const { value } = await budgetedCall(
        admin,
        {
          api: 'ors_drive',
          key: cacheKey('drive-ors', q.origin, q.destination, departAt),
          ttlS: 600, // typical times don't change minute to minute
          dailyCap: 1500, // ORS free tier: 2,000 directions a day
        },
        () => orsDrive(orsKey, q.origin, q.destination, AbortSignal.timeout(PART_TIMEOUT_MS)),
      );
      return { trips: carTripsFromDrive(value, departAt, 'ors'), live: false };
    };

    const [walkResult, carResult] = await Promise.allSettled([
      q.modes.includes('walk') ? walk() : Promise.resolve(null),
      q.modes.includes('car') ? car() : Promise.resolve(null),
    ]);

    const options: TripOption[] = [];
    let condition: ConditionMode = q.condition ?? 'normal';
    if (walkResult.status === 'fulfilled' && walkResult.value) {
      options.push(...walkResult.value.trips);
      condition = walkResult.value.condition ?? condition;
    } else if (walkResult.status === 'rejected') {
      unavailable.push({ mode: 'walk', reason: 'No walking route found right now' });
    }
    let trafficAt: string | null = null;
    if (carResult.status === 'fulfilled' && carResult.value) {
      options.push(...carResult.value.trips);
      if (carResult.value.live) trafficAt = new Date().toISOString();
    } else if (carResult.status === 'rejected') {
      unavailable.push({ mode: 'car', reason: 'Driving routes unavailable right now' });
    }

    console.log(`plan-trip ${options.length} options in ${Date.now() - started} ms`);
    return json(
      PlanTripResponseSchema.parse({
        options: rankTrips(options, condition),
        unavailable,
        condition,
        data_freshness: { traffic_at: trafficAt },
      }),
    );
  }),
};
