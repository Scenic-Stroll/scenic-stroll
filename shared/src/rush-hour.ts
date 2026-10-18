/**
 * Demo: "Simulate rush hour" (multimodal step 7, brief "demo safety"). Judges see the app at a
 * quiet hour, when driving looks quick. This slows every car and taxi option to a heavy jam,
 * re-prices the taxi meter for the time spent stuck, and re-ranks, so the green nudge towards
 * walking and the MTR shows up the way it does at 6 pm. Everything it touches is labelled
 * "simulated" on the card; it never runs unless the demo switch is on.
 */
import { taxiMeterFare } from './taxi-fare.ts';
import { rankTrips } from './trip-plan.ts';
import type { PlanTripResponse, TripOption } from './trip-schema.ts';

/** Driving takes this many times as long as usual: a heavy jam on Waterloo Road / Nathan Road. */
export const RUSH_HOUR_FACTOR = 2.5;

const shift = (iso: string, s: number) => new Date(Date.parse(iso) + s * 1000).toISOString();

function slowDown(o: TripOption): TripOption {
  const i = o.legs.findIndex((l) => l.mode === 'car' || l.mode === 'taxi');
  const leg = o.legs[i];
  if (!leg) return o;
  const driveS = (Date.parse(leg.arrive_at) - Date.parse(leg.depart_at)) / 1000;
  const extraS = Math.round(driveS * (RUSH_HOUR_FACTOR - 1));
  const legs = o.legs.map((l, j) =>
    j < i
      ? l
      : j === i
        ? {
            ...l,
            arrive_at: shift(l.arrive_at, extraS),
            realtime: false,
            // Whole route red on the map: it's a jam, and it's simulated.
            traffic_segments: [{ from: 0, to: l.geometry.length - 1, level: 'jam' as const }],
          }
        : { ...l, depart_at: shift(l.depart_at, extraS), arrive_at: shift(l.arrive_at, extraS) },
  );
  // The meter also charges for minutes stuck in traffic: about half to all of the extra time.
  const stuckMin = extraS / 60;
  const range: [number, number] | undefined =
    o.mode === 'taxi'
      ? [taxiMeterFare(o.distance_m, stuckMin / 2), taxiMeterFare(o.distance_m, stuckMin)]
      : undefined;
  return {
    ...o,
    legs,
    total_s: o.total_s + extraS,
    arrive_at: shift(o.arrive_at, extraS),
    traffic: { delay_s: extraS, live: false, avoids: null },
    ...(range ? { cost_hkd: range[0], cost_range_hkd: range } : {}),
    estimated: [...new Set([...o.estimated.filter((e) => e !== 'traffic'), 'simulated_traffic'])],
  };
}

export function withRushHour(plan: PlanTripResponse): PlanTripResponse {
  const options = plan.options.map((o) =>
    o.mode === 'car' || o.mode === 'taxi' ? slowDown(o) : o,
  );
  return {
    ...plan,
    options: rankTrips(options, plan.condition),
    data_freshness: { ...plan.data_freshness, traffic_at: null },
  };
}
