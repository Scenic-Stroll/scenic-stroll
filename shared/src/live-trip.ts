/**
 * Live trip updates (multimodal step 6), as plain functions the app calls every refresh:
 *   * transit: given the live arrivals at your boarding stop and how long the walk there takes,
 *     when must you leave, and which vehicle will you actually catch?
 *   * car / taxi: has a route appeared that is clearly faster than the one you picked?
 * No fetching here; the app feeds in fresh data (stop ETAs every 30 s, plan-trip every 2 min).
 */
import { formatDuration, formatHkTime } from './format.ts';
import type { StopArrival } from './transit/eta-schema.ts';
import { BOARDING_BUFFER_S } from './transit/live-departures.ts';
import type { TripOption } from './trip-schema.ts';

/** Offer another car route only when it saves at least this much (brief: ≥ 3 min). */
export const REROUTE_MIN_SAVING_S = 3 * 60;

export type CatchPlan =
  /** The next departure is still reachable: leave within `leaveInS` seconds (0 = now). */
  | { kind: 'leave'; departure: StopArrival; leaveInS: number }
  /** The very next one is gone by the time you'd get there; `departure` is the one you'll catch. */
  | { kind: 'missed_next'; missed: StopArrival; departure: StopArrival; leaveInS: number }
  /** Nothing listed that you can reach (late night, or the operator listed none). */
  | { kind: 'none' };

/**
 * `walkS` = walk to the stop; `now` = ms. Leaving at `departure − walk − buffer` gets you there
 * just in time (the same 60 s boarding buffer plan-trip uses).
 */
export function catchPlan(arrivals: StopArrival[], walkS: number, now: number): CatchPlan {
  const sorted = [...arrivals]
    .filter((a) => Date.parse(a.at) > now)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const leaveBy = (a: StopArrival) => Date.parse(a.at) - (walkS + BOARDING_BUFFER_S) * 1000;
  const first = sorted[0];
  if (!first) return { kind: 'none' };
  if (leaveBy(first) >= now) {
    return { kind: 'leave', departure: first, leaveInS: Math.round((leaveBy(first) - now) / 1000) };
  }
  const next = sorted.find((a) => leaveBy(a) >= now);
  if (!next) return { kind: 'none' };
  return {
    kind: 'missed_next',
    missed: first,
    departure: next,
    leaveInS: Math.round((leaveBy(next) - now) / 1000),
  };
}

/** One plain sentence for the card. `what` = "KTL", "bus 2B"… */
export function catchMessage(plan: CatchPlan, what: string): string {
  if (plan.kind === 'none') return `No ${what} departures you can reach are listed right now`;
  const at = formatHkTime(plan.departure.at);
  const leave =
    plan.leaveInS < 60
      ? `Leave now for the ${at} ${what}`
      : `Leave in ${formatDuration(plan.leaveInS)} for the ${at} ${what}`;
  if (plan.kind === 'leave') return leave;
  return `You'd miss the ${formatHkTime(plan.missed.at)} — ${leave.charAt(0).toLowerCase()}${leave.slice(1)}`;
}

/**
 * A clearly faster option of the same kind (car → car, taxi → taxi) after a refresh, or null.
 * Compared by total time, so a taxi's pickup time counts too.
 */
export function fasterAlternative(
  selected: TripOption,
  options: TripOption[],
  minSavingS = REROUTE_MIN_SAVING_S,
): TripOption | null {
  if (selected.mode !== 'car' && selected.mode !== 'taxi') return null;
  const current = options.find((o) => o.id === selected.id) ?? selected;
  const best = options
    .filter((o) => o.mode === selected.mode && o.id !== selected.id)
    .sort((a, b) => a.total_s - b.total_s)[0];
  return best && current.total_s - best.total_s >= minSavingS ? best : null;
}
