/**
 * Taxi option (multimodal step 4): the same driving route as the car, priced with Hong Kong's
 * official urban (red) taxi meter. The meter works in "jumps": after the first 2 km, every 200 m
 * driven OR every minute spent waiting in traffic adds one jump. Jumps are dearer until the fare
 * reaches a threshold, then cheaper.
 *
 * Tariff: Transport Department, "Taxi Fare of Hong Kong", urban taxis, in force from 14 July 2024
 * (checked 2026-10-18): https://www.td.gov.hk/en/transport_in_hong_kong/public_transport/taxi/taxi_fare_of_hong_kong/
 * If the tariff changes, update URBAN_TAXI and the test in taxi-fare.test.ts.
 */
import { co2Grams } from './emissions.ts';
import type { DriveRoute } from './trip-plan.ts';
import type { TripOption } from './trip-schema.ts';

export const URBAN_TAXI = {
  /** Flag fall: covers the first 2 km. */
  flagFallHkd: 29,
  flagFallM: 2000,
  /** Every further 200 m, or every minute waiting. */
  jumpM: 200,
  jumpHkd: 2.1,
  /** Once the fare reaches this, each jump costs less. */
  thresholdHkd: 102.5,
  jumpAfterThresholdHkd: 1.4,
} as const;

/**
 * What the meter shows for `distanceM` driven plus `waitingMin` minutes stopped or crawling.
 * Tolls, luggage (HK$6 a piece) and booking fees are extra and not included.
 */
export function taxiMeterFare(distanceM: number, waitingMin = 0): number {
  const t = URBAN_TAXI;
  const jumps =
    Math.ceil(Math.max(0, distanceM - t.flagFallM) / t.jumpM) + Math.ceil(Math.max(0, waitingMin));
  // Count in 10-cent units: adding 2.1 again and again in floating point can land just under
  // the threshold and charge one jump at the wrong rate.
  const tenths = (hkd: number) => Math.round(hkd * 10);
  let fare = tenths(t.flagFallHkd);
  for (let i = 0; i < jumps; i++) {
    fare += fare < tenths(t.thresholdHkd) ? tenths(t.jumpHkd) : tenths(t.jumpAfterThresholdHkd);
  }
  return fare / 10;
}

/**
 * Low and high fare for a route. Low = the meter for the distance alone (traffic flowing). High
 * adds waiting minutes: the live traffic delay when we have it, else 15% of the trip time — a
 * rough allowance for lights and queues, which is why we show a range, never one exact price.
 */
export function taxiFareRange(r: DriveRoute): [number, number] {
  const waitingMin =
    r.live && r.typical_s !== null
      ? Math.max(0, r.duration_s - r.typical_s) / 60
      : (r.duration_s * 0.15) / 60;
  return [taxiMeterFare(r.distance_m), taxiMeterFare(r.distance_m, waitingMin)];
}

/**
 * Average time to get a taxi in urban Kowloon: our assumption, not measured. We add it so a taxi
 * isn't shown as quicker than a car you already have. Labelled as an estimate on the card.
 */
export const TAXI_PICKUP_S = 3 * 60;

/** One taxi option from the quickest driving route. */
export function taxiTripFromDrive(routes: DriveRoute[], departAt: Date, source: string) {
  const r = [...routes].sort((a, b) => a.duration_s - b.duration_s)[0];
  if (!r) return null;
  const [low, high] = taxiFareRange(r);
  const at = (s: number) => new Date(departAt.getTime() + s * 1000).toISOString();
  const trip: TripOption = {
    id: 'taxi-0',
    mode: 'taxi',
    title: r.description ? `Taxi via ${r.description}` : 'Taxi',
    total_s: r.duration_s + TAXI_PICKUP_S,
    depart_at: departAt.toISOString(),
    arrive_at: at(r.duration_s + TAXI_PICKUP_S),
    distance_m: r.distance_m,
    cost_hkd: low,
    cost_range_hkd: [low, high],
    // Per vehicle, like the car (HK taxis run on LPG; we use the same per-km estimate, labelled).
    co2_g: co2Grams('car', r.distance_m),
    walking_s: 0,
    waiting_s: TAXI_PICKUP_S,
    transfers: 0,
    step_free: 'unconfirmed',
    sun_exposed_pct: null,
    uncovered_pct: null,
    legs: [
      {
        mode: 'taxi',
        operator: null,
        route_name: r.description,
        depart_at: at(TAXI_PICKUP_S),
        arrive_at: at(r.duration_s + TAXI_PICKUP_S),
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
    estimated: r.live
      ? ['co2', 'taxi_fare', 'taxi_pickup']
      : ['traffic', 'co2', 'taxi_fare', 'taxi_pickup'],
    source,
  };
  return trip;
}
