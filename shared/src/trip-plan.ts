/**
 * Turns each mode's result into a TripOption (trip-schema.ts), then labels and sorts them.
 * Pure functions: the plan-trip Edge Function calls them, and they're unit-tested.
 *
 * The green nudge (brief: "never present driving as the default"): a walk (or, later, transit)
 * option that's at most NUDGE_MARGIN_S slower than the fastest car option is marked `recommended`
 * with the time and CO₂ comparison.
 */
import type { PlanRouteResponse, RouteStep } from './api.ts';
import type { ConditionMode } from './conditions.ts';
import { co2Grams } from './emissions.ts';
import { formatDuration } from './format.ts';
import { PROFILE_LABELS } from './routing-profiles.ts';
import type { LatLng } from './schemas.ts';
import type { SmartRouteOption } from './smart-route-api.ts';
import type { TrafficSegment, TripLabel, TripOption } from './trip-schema.ts';

/** Walk/transit within this of driving gets the green nudge (configurable per request later). */
export const NUDGE_MARGIN_S = 5 * 60;

const at = (start: Date, plusS: number) => new Date(start.getTime() + plusS * 1000).toISOString();

const walkLeg = (
  start: Date,
  totalS: number,
  distanceM: number,
  geometry: LatLng[],
  instructions: RouteStep[],
) => ({
  mode: 'walk' as const,
  operator: null,
  route_name: null,
  depart_at: start.toISOString(),
  arrive_at: at(start, totalS),
  realtime: false,
  distance_m: distanceM,
  geometry,
  instructions,
});

/** One of our computed walks (smart-route), with its shade / cover / step-free facts. */
export function walkTripFromSmart(o: SmartRouteOption, departAt: Date): TripOption {
  return {
    id: `walk-${o.id}`,
    mode: 'walk',
    title: `Walk · ${PROFILE_LABELS[o.profile].en}`,
    total_s: o.duration_s,
    depart_at: departAt.toISOString(),
    arrive_at: at(departAt, o.duration_s),
    distance_m: o.distance_m,
    cost_hkd: 0,
    co2_g: 0,
    walking_s: o.duration_s,
    waiting_s: 0,
    transfers: 0,
    step_free: o.step_free,
    sun_exposed_pct:
      o.pct_shaded === null || o.distance_m === 0
        ? null
        : Math.round((o.exposure.sun_m / o.distance_m) * 100),
    uncovered_pct: 100 - o.pct_covered,
    legs: [walkLeg(departAt, o.duration_s, o.distance_m, o.coordinates, o.steps)],
    labels: [],
    recommended: false,
    nudge: null,
    traffic: null,
    estimated: o.estimated,
    source: 'walking-graph',
  };
}

/** The standard street walking route (outside our walking graph): no shade/cover facts. */
export function walkTripFromStandard(r: PlanRouteResponse, departAt: Date): TripOption {
  return {
    id: 'walk-standard',
    mode: 'walk',
    title: 'Walk',
    total_s: r.duration_s,
    depart_at: departAt.toISOString(),
    arrive_at: at(departAt, r.duration_s),
    distance_m: r.distance_m,
    cost_hkd: 0,
    co2_g: 0,
    walking_s: r.duration_s,
    waiting_s: 0,
    transfers: 0,
    step_free: 'unconfirmed',
    sun_exposed_pct: null,
    uncovered_pct: null,
    legs: [walkLeg(departAt, r.duration_s, r.distance_m, r.coordinates, r.steps ?? [])],
    labels: [],
    recommended: false,
    nudge: null,
    traffic: null,
    estimated: [],
    source: r.provider,
  };
}

/** A driving route as the drive clients (Google with traffic, ORS without) return it. */
export type DriveRoute = {
  distance_m: number;
  /** With traffic now when `live`, else typical. */
  duration_s: number;
  /** Typical duration without today's traffic; null when unknown. */
  typical_s: number | null;
  coordinates: LatLng[];
  segments: TrafficSegment[];
  /** Google's short name for the route, e.g. "Waterloo Rd". */
  description: string | null;
  steps: RouteStep[];
  live: boolean;
};

export function carTripsFromDrive(
  routes: DriveRoute[],
  departAt: Date,
  source: string,
): TripOption[] {
  return routes.map((r, i) => ({
    id: `car-${i}`,
    mode: 'car',
    title: r.description ? `Car via ${r.description}` : 'Car',
    total_s: r.duration_s,
    depart_at: departAt.toISOString(),
    arrive_at: at(departAt, r.duration_s),
    distance_m: r.distance_m,
    cost_hkd: null, // fuel, parking and tolls vary too much to guess
    co2_g: co2Grams('car', r.distance_m),
    walking_s: 0,
    waiting_s: 0,
    transfers: 0,
    // Door to door, but the drop-off point isn't known: never claim more than we know.
    step_free: 'unconfirmed',
    sun_exposed_pct: null,
    uncovered_pct: null,
    legs: [
      {
        mode: 'car',
        operator: null,
        route_name: r.description,
        depart_at: departAt.toISOString(),
        arrive_at: at(departAt, r.duration_s),
        realtime: r.live,
        distance_m: r.distance_m,
        geometry: r.coordinates,
        traffic_segments: r.segments,
        instructions: r.steps,
      },
    ],
    labels: [],
    recommended: false,
    nudge: null,
    traffic: {
      delay_s:
        r.live && r.typical_s !== null ? Math.max(0, Math.round(r.duration_s - r.typical_s)) : null,
      live: r.live,
      avoids: null,
    },
    estimated: r.live ? ['co2'] : ['traffic', 'co2'],
    source,
  }));
}

const by = <T>(xs: T[], key: (x: T) => number) =>
  xs.reduce<T | undefined>(
    (best, x) => (best === undefined || key(x) < key(best) ? x : best),
    undefined,
  );

/** Seconds of "cost" per gram of CO₂ in the default sort: 1 km by car ≈ 33 s. */
const S_PER_G_CO2 = 0.2;
/** In rain or heat, each exposed walking second counts this much extra. */
const EXPOSURE_WEIGHT = 0.5;

/** "Best for you": time, plus a little for CO₂, transfers and (in rain/heat) exposed walking. */
export function bestForYouScore(o: TripOption, condition: ConditionMode): number {
  const exposedPct =
    condition === 'rain' || condition === 'typhoon_or_black_rain'
      ? o.uncovered_pct
      : condition === 'heat'
        ? o.sun_exposed_pct
        : 0;
  // Unknown exposure counts as half exposed (same rule as the walking router).
  const exposure = ((exposedPct ?? 50) / 100) * o.walking_s * EXPOSURE_WEIGHT;
  return (
    o.total_s + S_PER_G_CO2 * o.co2_g + 120 * o.transfers + (condition === 'normal' ? 0 : exposure)
  );
}

export const TRIP_SORTS = ['best', 'fastest', 'cheapest', 'greenest', 'least_walking'] as const;
export type TripSort = (typeof TRIP_SORTS)[number];

export function sortTrips(options: TripOption[], sort: TripSort, condition: ConditionMode) {
  const key: Record<TripSort, (o: TripOption) => number> = {
    best: (o) => bestForYouScore(o, condition),
    fastest: (o) => o.total_s,
    cheapest: (o) => o.cost_hkd ?? Infinity,
    greenest: (o) => o.co2_g,
    least_walking: (o) => o.walking_s,
  };
  // Ties broken by time, so the order is stable and sensible.
  return [...options].sort((a, b) => key[sort](a) - key[sort](b) || a.total_s - b.total_s);
}

/** Adds labels, the "avoids traffic" note and the green nudge, and sorts best-for-you first. */
export function rankTrips(
  options: TripOption[],
  condition: ConditionMode,
  nudgeMarginS = NUDGE_MARGIN_S,
): TripOption[] {
  // Start clean: options may be re-ranked after a change (e.g. the demo's simulated rush hour).
  const out = options.map((o) => ({
    ...o,
    labels: [] as TripLabel[],
    recommended: false,
    nudge: null as string | null,
  }));
  const label = (o: TripOption | undefined, l: TripLabel) => o && o.labels.push(l);

  const byTimeThen = (k: (o: TripOption) => number) => (o: TripOption) => k(o) * 1e6 + o.total_s;
  label(
    by(out, (o) => o.total_s),
    'fastest',
  );
  label(
    by(
      out,
      byTimeThen((o) => o.co2_g),
    ),
    'greenest',
  );
  label(
    by(
      out.filter((o) => o.cost_hkd !== null),
      byTimeThen((o) => o.cost_hkd!),
    ),
    'cheapest',
  );
  label(
    by(
      out,
      byTimeThen((o) => o.walking_s),
    ),
    'least_walking',
  );
  label(
    by(
      out.filter((o) => o.uncovered_pct !== null),
      byTimeThen((o) => o.uncovered_pct!),
    ),
    'most_sheltered',
  );
  for (const o of out) if (o.step_free === 'yes') o.labels.push('step_free');

  // Avoids traffic: the quickest car option, when another car route is clearly slower now.
  const cars = out.filter((o) => o.mode === 'car' && o.traffic?.live);
  const bestCar = by(cars, (o) => o.total_s);
  const slower = cars.filter((o) => bestCar && o !== bestCar && o.total_s - bestCar.total_s >= 120);
  if (bestCar?.traffic && slower.length > 0) {
    const other = by(slower, (o) => o.total_s)!;
    bestCar.labels.push('avoids_traffic');
    bestCar.traffic.avoids = `Avoids traffic: saves ${formatDuration(other.total_s - bestCar.total_s)} vs ${other.title.replace(/^Car /, 'the route ')}`;
  }

  // Green nudge: walking within a few minutes of the quickest car.
  const fastestCar = by(
    out.filter((o) => o.mode === 'car' || o.mode === 'taxi'),
    (o) => o.total_s,
  );
  if (fastestCar) {
    for (const o of out) {
      if (o.mode !== 'walk' && o.mode !== 'transit') continue;
      const slowerBy = o.total_s - fastestCar.total_s;
      if (slowerBy > nudgeMarginS) continue;
      o.recommended = true;
      const time =
        slowerBy <= 30
          ? 'As quick as driving'
          : `Only ${formatDuration(slowerBy)} slower than driving`;
      const saved = fastestCar.co2_g - o.co2_g;
      o.nudge = saved > 0 ? `${time} · saves ~${saved} g CO₂` : time;
    }
  }
  return sortTrips(out, 'best', condition);
}
