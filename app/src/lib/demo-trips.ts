/**
 * Demo safety for multimodal (step 7): plan-trip answers for the demo trips, saved by
 * `npm run demo:trips`. Used ONLY when the live plan-trip call fails or comes back empty, and the
 * trip list then says "Saved for the demo" — never passed off as live. Times are moved so the
 * trip starts now (the durations are what was measured when saved).
 */
import {
  haversineMeters,
  PlanTripResponseSchema,
  type LatLng,
  type PlanTripResponse,
} from '@scenic/shared';

import snapshot from '@/demo/trip-snapshot.json';

/** A plan, plus when it was saved if it isn't live ("18:05 on 2026-10-18"). */
export type TripPlan = PlanTripResponse & { savedFor?: string };

/** Search results and map taps land near, not on, the saved points. */
const SAME_PLACE_M = 300;

type Entry = { from: LatLng; to: LatLng; response: unknown };

const shift = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString();

/** Move every time in the plan so the trip leaves at `now`. */
function startingNow(plan: PlanTripResponse, now: number): PlanTripResponse {
  const first = plan.options[0];
  if (!first) return plan;
  const ms = now - Date.parse(first.depart_at);
  return {
    ...plan,
    options: plan.options.map((o) => ({
      ...o,
      depart_at: shift(o.depart_at, ms),
      arrive_at: shift(o.arrive_at, ms),
      legs: o.legs.map((l) => ({
        ...l,
        depart_at: shift(l.depart_at, ms),
        arrive_at: shift(l.arrive_at, ms),
      })),
    })),
  };
}

export function savedDemoTrip(origin: LatLng, destination: LatLng): TripPlan | null {
  const entry = (snapshot.entries as Entry[]).find(
    (e) =>
      haversineMeters(e.from, origin) <= SAME_PLACE_M &&
      haversineMeters(e.to, destination) <= SAME_PLACE_M,
  );
  if (!entry || !snapshot.saved) return null;
  // Checked like a live answer, so an outdated file can't break the list.
  const parsed = PlanTripResponseSchema.safeParse(entry.response);
  if (!parsed.success) return null;
  return { ...startingNow(parsed.data, Date.now()), savedFor: snapshot.saved };
}
