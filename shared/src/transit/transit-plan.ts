/**
 * Public transport trips (multimodal step 2) in one neutral shape, whether they come from Google
 * transit or our own MTR planner, and how they become a TripOption.
 *
 * Walking legs start as estimates (straight lines, or Google's walking); inside our walking graph
 * plan-trip swaps them for our own computed walks (withWalkLeg), so the walk to the station is
 * shaded / sheltered / step-free aware like any other walk.
 */
import type { RouteStep } from '../api.ts';
import { co2Grams } from '../emissions.ts';
import type { LatLng } from '../schemas.ts';
import type { SmartRouteOption } from '../smart-route-api.ts';
import type { TripLeg, TripOption } from '../trip-schema.ts';

export type TransitPlanLeg =
  | {
      kind: 'walk';
      duration_s: number;
      distance_m: number;
      geometry: LatLng[];
      instructions: RouteStep[];
    }
  | {
      kind: 'ride';
      /** 'rail' for MTR / light rail / tram, 'bus' for bus, minibus and ferry (CO₂ factor). */
      vehicle: 'rail' | 'bus';
      operator: string | null;
      line: string;
      color: string | null;
      from_name: string;
      to_name: string;
      stops: number;
      /** Waiting before boarding (scheduled estimate, or a real-time ETA later). */
      wait_s: number;
      duration_s: number;
      distance_m: number;
      geometry: LatLng[];
      instruction: string;
      realtime: boolean;
      /** Where to board, for live arrivals (see TripLeg.boarding). */
      boarding?: { stop_id: string; route: string; dest_codes?: string[] | null } | null;
    };

export type TransitPlan = {
  id: string;
  legs: TransitPlanLeg[];
  /** HK$; null when unknown ("fare unavailable"). */
  fare_hkd: number | null;
  source: 'google' | 'mtr-open-data';
  /** e.g. ['transit_times'] when ride times are estimated from distance. */
  estimated: string[];
  /** Our MTR planner: where you board and get off (station ids), to look up the fare. */
  mtr?: { from_id: number; to_id: number };
};

const iso = (t: number) => new Date(t).toISOString();

/** Builds the TripOption, timing the legs one after another from `departAt`. */
export function transitTripFromPlan(plan: TransitPlan, departAt: Date): TripOption {
  let clock = departAt.getTime();
  const legs: TripLeg[] = plan.legs.map((l) => {
    if (l.kind === 'walk') {
      const start = clock;
      clock += l.duration_s * 1000;
      return {
        mode: 'walk',
        operator: null,
        route_name: null,
        depart_at: iso(start),
        arrive_at: iso(clock),
        realtime: false,
        distance_m: l.distance_m,
        geometry: l.geometry,
        instructions: l.instructions,
      };
    }
    clock += l.wait_s * 1000; // wait at the stop, then ride
    const start = clock;
    clock += l.duration_s * 1000;
    return {
      mode: 'transit',
      operator: l.operator,
      route_name: l.line,
      color: l.color,
      from_name: l.from_name,
      to_name: l.to_name,
      stops: l.stops,
      boarding: l.boarding ?? null,
      depart_at: iso(start),
      arrive_at: iso(clock),
      realtime: l.realtime,
      distance_m: l.distance_m,
      geometry: l.geometry,
      instructions: [
        { instruction: l.instruction, distance_m: l.distance_m, duration_s: l.duration_s },
      ],
    };
  });
  const rides = plan.legs.filter((l) => l.kind === 'ride');
  const walks = plan.legs.filter((l) => l.kind === 'walk');
  const total = (clock - departAt.getTime()) / 1000;
  return {
    id: `transit-${plan.id}`,
    mode: 'transit',
    title: rides.map((r) => r.line).join(' → ') || 'Public transport',
    total_s: Math.round(total),
    depart_at: departAt.toISOString(),
    arrive_at: iso(clock),
    distance_m: Math.round(plan.legs.reduce((s, l) => s + l.distance_m, 0)),
    cost_hkd: plan.fare_hkd,
    co2_g: rides.reduce((s, r) => s + co2Grams(r.vehicle, r.distance_m), 0),
    walking_s: Math.round(walks.reduce((s, w) => s + w.duration_s, 0)),
    waiting_s: Math.round(rides.reduce((s, r) => s + r.wait_s, 0)),
    transfers: Math.max(0, rides.length - 1),
    // Stations and stops: lifts usually exist, but we can't vouch for every exit and stop.
    step_free: 'unconfirmed',
    sun_exposed_pct: null,
    uncovered_pct: null,
    legs,
    labels: [],
    recommended: false,
    nudge: null,
    traffic: null,
    estimated: [...plan.estimated, 'co2'],
    source: plan.source,
  };
}

/**
 * Replaces walking legs with our computed walks (leg index → walk) and re-times the trip. When every
 * walking leg is one of ours, the trip's sun / cover numbers become their distance-weighted average;
 * otherwise they stay "unknown" rather than half-guessed.
 */
export function withWalkLegs(trip: TripOption, walks: Map<number, SmartRouteOption>): TripOption {
  const replaced = [...walks].filter(([i]) => trip.legs[i]?.mode === 'walk');
  if (replaced.length === 0) return trip;
  const ms = (t: string) => new Date(t).getTime();
  // Waits sit between legs (before a ride): keep each gap as it was.
  const gaps = trip.legs.map((l, i) =>
    i === 0 ? 0 : ms(l.depart_at) - ms(trip.legs[i - 1]!.arrive_at),
  );
  let clock = ms(trip.depart_at);
  let walkingS = trip.walking_s;
  let distanceM = trip.distance_m;
  const legs = trip.legs.map((l, i) => {
    const walk = walks.get(i);
    const durationMs =
      walk && l.mode === 'walk' ? walk.duration_s * 1000 : ms(l.arrive_at) - ms(l.depart_at);
    clock += gaps[i]!;
    const start = clock;
    clock += durationMs;
    const timed = { ...l, depart_at: iso(start), arrive_at: iso(clock) };
    if (!walk || l.mode !== 'walk') return timed;
    walkingS += walk.duration_s - (ms(l.arrive_at) - ms(l.depart_at)) / 1000;
    distanceM += walk.distance_m - l.distance_m;
    return {
      ...timed,
      distance_m: walk.distance_m,
      geometry: walk.coordinates,
      instructions: walk.steps,
    };
  });
  const walked = replaced.map(([, w]) => w);
  const walkedM = walked.reduce((s, w) => s + w.distance_m, 0);
  // Cover / sun only when EVERY walking leg is one of ours: half-known would read as "sheltered".
  const allWalksKnown = replaced.length === trip.legs.filter((l) => l.mode === 'walk').length;
  const sunKnown = allWalksKnown && walked.every((w) => w.pct_shaded !== null);
  return {
    ...trip,
    legs,
    total_s: Math.round((clock - ms(trip.depart_at)) / 1000),
    arrive_at: iso(clock),
    walking_s: Math.round(walkingS),
    distance_m: Math.round(distanceM),
    sun_exposed_pct:
      sunKnown && walkedM > 0
        ? Math.round((walked.reduce((s, w) => s + w.exposure.sun_m, 0) / walkedM) * 100)
        : null,
    uncovered_pct:
      allWalksKnown && walkedM > 0
        ? Math.round(walked.reduce((s, w) => s + (100 - w.pct_covered) * w.distance_m, 0) / walkedM)
        : null,
    estimated: [...new Set([...trip.estimated, ...walked.flatMap((w) => w.estimated)])],
  };
}
