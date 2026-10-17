/**
 * Demo safety (brief §10): smart routes for the demo trips, saved by `npm run demo:snapshot` the day
 * before the pitch. Used ONLY when the live smart-route call fails (no network, server down), and
 * the planning sheet then says the routes are saved ones — never passed off as live.
 */
import {
  haversineMeters,
  PRESETS,
  SmartRouteResponseSchema,
  type ConditionMode,
  type LatLng,
  type RoutingProfile,
  type SmartRouteResponse,
} from '@scenic/shared';

import snapshot from '@/demo/smart-route-snapshot.json';

/** A saved answer: the response plus when it was computed for ("13:00 on 2026-10-24"). */
export type SavedRoutes = SmartRouteResponse & { savedFor: string };

/** A tapped point counts as the demo place if it's this close (the place picker gives exact points). */
const SAME_PLACE_M = 40;

const near = (p: LatLng, presetId: string) => {
  const preset = PRESETS.find((x) => x.id === presetId);
  return preset !== undefined && haversineMeters(p, preset.point) <= SAME_PLACE_M;
};

export function savedDemoRoutes(args: {
  origin: LatLng;
  destination: LatLng;
  profile: RoutingProfile;
  condition: ConditionMode;
}): SavedRoutes | null {
  const entry = snapshot.entries.find(
    (e) =>
      e.profile === args.profile &&
      e.condition === args.condition &&
      near(args.origin, e.from) &&
      near(args.destination, e.to),
  );
  if (!entry) return null;
  // Checked like a live answer, so an outdated file can't show a broken route.
  const parsed = SmartRouteResponseSchema.safeParse(entry.response);
  if (!parsed.success) return null;
  return { ...parsed.data, savedFor: `${snapshot.time} on ${snapshot.day}` };
}
