// POST /functions/v1/plan-trip  { origin, destination, depart_at?, modes?, condition? }
// → { options: TripOption[] (best for you first), unavailable, condition, data_freshness }
// Multimodal steps 1–2: walk, car and public transport, in one comparable shape (trip-schema.ts).
//   * walk: our own computed routes (the smart-route function — shade, cover, step-free) inside the
//     walking graph's area; the standard street walk elsewhere
//   * car: Google Routes with live traffic when GOOGLE_ROUTES_API_KEY is set (cached 3 min, daily
//     cap), else OpenRouteService with typical times
//   * transit: Google Routes TRANSIT (with the key), else our own MTR planner from MTR open data;
//     walking legs to/from stations inside our walking graph are swapped for our computed walks
// Each part has its own fallback and a time limit; a failed mode is listed in `unavailable`, never
// an error. No language model anywhere in here.
//
// auth: 'user' → only signed-in app users (anonymous accounts count) can spend our routing quota.
import { withSupabase } from '@supabase/server';

import { budgetedCall, BudgetError, cacheKey } from '../_shared/api-budget.ts';
import { googleDrive, orsDrive } from '../_shared/drive.ts';
import { stopEta } from '../_shared/eta-fetch.ts';
import { googleTransit } from '../_shared/transit-google.ts';
import { errorResponse, json, readBody } from '../_shared/http.ts';
import { getRoutingProvider } from '../_shared/routing/index.ts';
import type { ConditionMode } from '../_shared/scenic/conditions.ts';
import { isInGraphArea } from '../_shared/scenic/graph-area.ts';
import type { LatLng } from '../_shared/scenic/schemas.ts';
import { PROFILE_FOR_CONDITION } from '../_shared/scenic/routing-profiles.ts';
import {
  SmartRouteResponseSchema,
  type SmartRouteOption,
  type SmartRouteResponse,
} from '../_shared/scenic/smart-route-api.ts';
import { MTR_FARES_CSV_URL, parseMtrFaresCsv } from '../_shared/scenic/transit/mtr-fares.ts';
import { arrivalsForLeg, withLiveDepartures } from '../_shared/scenic/transit/live-departures.ts';
import { planMtrTrips } from '../_shared/scenic/transit/mtr-planner.ts';
import {
  transitTripFromPlan,
  withWalkLegs,
  type TransitPlan,
} from '../_shared/scenic/transit/transit-plan.ts';
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
/** Live arrival lists only reach ~20 min ahead; for later trips we keep scheduled/estimated waits. */
const LIVE_ETA_WINDOW_MS = 20 * 60_000;
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

    // ---- our computed walks (the smart-route function, same user and token) -------------------
    const smartWalk = async (from: LatLng, to: LatLng): Promise<SmartRouteResponse | null> => {
      const res = await fetch(`${env('SUPABASE_URL')}/functions/v1/smart-route`, {
        method: 'POST',
        signal: AbortSignal.timeout(PART_TIMEOUT_MS),
        headers: {
          Authorization: req.headers.get('Authorization') ?? '',
          apikey: req.headers.get('apikey') ?? '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          origin: from,
          destination: to,
          // With a known condition ask for its best profile; else smart-route adds "Best now".
          profile: q.condition ? PROFILE_FOR_CONDITION[q.condition] : 'fastest',
          condition: q.condition,
          departure_time: departAt.toISOString(),
        }),
      });
      const smart = SmartRouteResponseSchema.parse(await res.json());
      return smart.status === 'ok' ? smart : null;
    };
    const bestNow = (smart: SmartRouteResponse): SmartRouteOption | undefined =>
      smart.options.find((o) => o.roles.includes('best_now')) ?? smart.options[0];

    // ---- walk ------------------------------------------------------------------------------
    const walk = async (): Promise<{ trips: TripOption[]; condition: ConditionMode | null }> => {
      try {
        const smart = await smartWalk(q.origin, q.destination);
        if (smart) {
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

    // ---- MTR fares (our planner) from public.mtr_fares, filled from MTR's CSV on first use ----
    const withMtrFares = async (plans: TransitPlan[]): Promise<TransitPlan[]> => {
      const need = plans.filter((p) => p.mtr);
      if (need.length === 0) return plans;
      const admin = ctx.supabaseAdmin;
      const srcIds = [...new Set(need.map((p) => p.mtr!.from_id))];
      const destIds = [...new Set(need.map((p) => p.mtr!.to_id))];
      const lookup = async () =>
        (
          await admin
            .from('mtr_fares')
            .select('src_id, dest_id, octopus_adult')
            .in('src_id', srcIds)
            .in('dest_id', destIds)
        ).data ?? [];
      try {
        let rows = await lookup();
        if (rows.length === 0) {
          const { count } = await admin
            .from('mtr_fares')
            .select('src_id', { count: 'exact', head: true });
          if (!count) {
            // First use: load MTR's fares (~9,000 rows) into the table, then look up again.
            const res = await fetch(MTR_FARES_CSV_URL, {
              signal: AbortSignal.timeout(PART_TIMEOUT_MS),
            });
            const all = parseMtrFaresCsv(await res.text());
            for (let i = 0; i < all.length; i += 2000) {
              await admin.from('mtr_fares').upsert(all.slice(i, i + 2000));
            }
            rows = await lookup();
          }
        }
        const fares = new Map(
          rows.map((r) => [`${r.src_id}-${r.dest_id}`, Number(r.octopus_adult)]),
        );
        return plans.map((p) =>
          p.mtr ? { ...p, fare_hkd: fares.get(`${p.mtr.from_id}-${p.mtr.to_id}`) ?? null } : p,
        );
      } catch (err) {
        console.warn('plan-trip: MTR fares unavailable', err);
        return plans; // the card says "Fare unavailable"
      }
    };

    // ---- public transport --------------------------------------------------------------------
    const transit = async (): Promise<TripOption[]> => {
      const googleKey = env('GOOGLE_ROUTES_API_KEY');
      let plans: TransitPlan[] = [];
      if (googleKey) {
        try {
          const { value } = await budgetedCall(
            ctx.supabaseAdmin,
            {
              api: 'google_routes_transit',
              key: cacheKey('transit', q.origin, q.destination, departAt),
              ttlS: 300,
              dailyCap: Number(env('GOOGLE_DAILY_CAP')) || DEFAULT_GOOGLE_DAILY_CAP,
            },
            () =>
              googleTransit(
                googleKey,
                q.origin,
                q.destination,
                departAt,
                AbortSignal.timeout(PART_TIMEOUT_MS),
              ),
          );
          plans = value;
        } catch (err) {
          console.warn('plan-trip: Google transit failed, using the MTR planner', err);
        }
      }
      // Our own planner: MTR only, ride times estimated from distance (and labelled so).
      if (plans.length === 0) plans = await withMtrFares(planMtrTrips(q.origin, q.destination));
      const trips = plans.slice(0, 3).map((p) => transitTripFromPlan(p, departAt));
      // Walking legs inside our walking graph -> our computed walks (the 2 best options only, to
      // keep the request quick). If that fails the estimated walk stays, labelled as such.
      const withWalks = await Promise.all(
        trips.map(async (t, i) => {
          if (i >= 2) return t;
          const walks = new Map<number, SmartRouteOption>();
          await Promise.all(
            t.legs.map(async (leg, li) => {
              const from = leg.geometry[0]!;
              const to = leg.geometry.at(-1)!;
              if (leg.mode !== 'walk' || !isInGraphArea(from) || !isInGraphArea(to)) return;
              try {
                const smart = await smartWalk(from, to);
                const best = smart ? bestNow(smart) : undefined;
                if (best) walks.set(li, best);
              } catch (err) {
                console.warn('plan-trip: walk leg kept as estimate', err);
              }
            }),
          );
          const improved = withWalkLegs(t, walks);
          // "Walks are estimates" goes only when every walking leg is one of ours.
          const allOurs = walks.size === t.legs.filter((l) => l.mode === 'walk').length;
          return allOurs
            ? { ...improved, estimated: improved.estimated.filter((e) => e !== 'walk_legs') }
            : improved;
        }),
      );
      return await withLiveEtas(withWalks);
    };

    // ---- live departures (MTR Next Train, KMB, Citybus, GMB) at each option's first stop --------
    // Only the first boarding: at a change of line we don't model the walk between platforms well
    // enough to promise a particular train. One call per stop, shared by all options (and cached
    // 30 s for everyone). If it fails the estimated wait stays, labelled as such.
    const withLiveEtas = async (trips: TripOption[]): Promise<TripOption[]> => {
      if (departAt.getTime() > Date.now() + LIVE_ETA_WINDOW_MS) return trips;
      const calls = new Map<string, ReturnType<typeof stopEta>>();
      const etaFor = (stopId: string) => {
        if (!calls.has(stopId)) {
          calls.set(stopId, stopEta(ctx.supabaseAdmin, stopId, AbortSignal.timeout(2_500)));
        }
        return calls.get(stopId)!;
      };
      return await Promise.all(
        trips.map(async (t) => {
          const i = t.legs.findIndex((l) => l.mode === 'transit');
          const boarding = t.legs[i]?.boarding;
          if (!boarding) return t;
          const eta = await etaFor(boarding.stop_id);
          if (!eta || eta.status !== 'live') return t;
          return withLiveDepartures(
            t,
            new Map([[i, arrivalsForLeg(eta.arrivals, boarding)]]),
            eta.fetched_at,
          );
        }),
      );
    };

    const [walkResult, carResult, transitResult] = await Promise.allSettled([
      q.modes.includes('walk') ? walk() : Promise.resolve(null),
      q.modes.includes('car') ? car() : Promise.resolve(null),
      q.modes.includes('transit') ? transit() : Promise.resolve(null),
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

    if (transitResult.status === 'fulfilled' && transitResult.value) {
      options.push(...transitResult.value);
      if (transitResult.value.length === 0) {
        unavailable.push({
          mode: 'transit',
          reason: 'No public transport option beats walking here',
        });
      }
    } else if (transitResult.status === 'rejected') {
      unavailable.push({ mode: 'transit', reason: 'Public transport unavailable right now' });
    }

    console.log(`plan-trip ${options.length} options in ${Date.now() - started} ms`);
    return json(
      PlanTripResponseSchema.parse({
        options: rankTrips(options, condition),
        unavailable,
        condition,
        data_freshness: {
          traffic_at: trafficAt,
          eta_at: options.map((o) => o.eta_at ?? null).find((at) => at !== null) ?? null,
        },
      }),
    );
  }),
};
