/**
 * Real-time departures in a trip (multimodal step 3): swap our estimated wait at the boarding stop
 * for the next real train or bus the walker can actually catch, then shift the rest of the trip.
 */
import type { StopArrival } from './eta-schema.ts';
import type { TripOption } from '../trip-schema.ts';

/**
 * Time to get from the station entrance / stop pole onto the vehicle. We'd rather show a later
 * train than one you only catch by running.
 */
export const BOARDING_BUFFER_S = 60;

/** Arrivals that are this leg's vehicle: the right route, and (MTR) going our way. */
export function arrivalsForLeg(
  arrivals: StopArrival[],
  boarding: { route: string; dest_codes?: string[] | null },
): StopArrival[] {
  return arrivals.filter(
    (a) =>
      a.route === boarding.route &&
      (!boarding.dest_codes || (a.dest_code !== null && boarding.dest_codes.includes(a.dest_code))),
  );
}

const ms = (t: string) => new Date(t).getTime();
const iso = (t: number) => new Date(t).toISOString();

/**
 * Re-time a trip with live departures. `live` maps a leg index to that leg's arrivals (already
 * filtered with arrivalsForLeg). For each such leg we take the first departure at or after the
 * moment the walker reaches the stop (+ buffer) — so if they'd miss the next one, it's the one
 * after. A leg whose list has nothing catchable keeps its estimated wait.
 */
export function withLiveDepartures(
  trip: TripOption,
  live: Map<number, StopArrival[]>,
  fetchedAt: string,
): TripOption {
  if (live.size === 0) return trip;
  let clock = ms(trip.depart_at);
  let waitingS = 0;
  let anyLive = false;
  const legs = trip.legs.map((leg, i) => {
    const gap = i === 0 ? 0 : ms(leg.depart_at) - ms(trip.legs[i - 1]!.arrive_at);
    const duration = ms(leg.arrive_at) - ms(leg.depart_at);
    const ready = clock + BOARDING_BUFFER_S * 1000;
    const catchable = (live.get(i) ?? []).filter((a) => ms(a.at) >= ready);
    const next = catchable[0];
    const start = next ? ms(next.at) : clock + gap;
    if (leg.mode === 'transit') waitingS += (start - clock) / 1000;
    clock = start + duration;
    if (!next) return { ...leg, depart_at: iso(start), arrive_at: iso(clock) };
    anyLive = true;
    return {
      ...leg,
      depart_at: iso(start),
      arrive_at: iso(clock),
      realtime: next.realtime,
      // The next few you could catch, for "missed it? next one in 4 min" on the card.
      live_departures: catchable.slice(0, 3).map((a) => a.at),
    };
  });
  if (!anyLive) return trip;
  return {
    ...trip,
    legs,
    total_s: Math.round((clock - ms(trip.depart_at)) / 1000),
    arrive_at: iso(clock),
    waiting_s: Math.round(waitingS),
    eta_at: fetchedAt,
  };
}
