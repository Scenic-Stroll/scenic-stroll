/**
 * The route follow mode walks: either one of our computed routes (smart-route) or the standard
 * street route, in one shape. Plus re-planning from where you are now.
 */
import {
  PROFILE_FOR_CONDITION,
  PROFILE_LABELS,
  type ClosingWarning,
  type ConditionMode,
  type LatLng,
  type PlanRouteResponse,
  type RouteStep,
  type RoutingProfile,
  type SmartRouteOption,
} from '@scenic/shared';

import { planRoute, smartRoute } from '@/lib/api';

export type FollowRoute = {
  title: string;
  /** null = the standard street route (no profile). */
  profile: RoutingProfile | null;
  coordinates: LatLng[];
  steps: RouteStep[];
  duration_s: number;
  distance_m: number;
  /** Walking-graph edges (computed routes only), to match blocked-path reports. */
  edgeIds: number[];
  closing: ClosingWarning[];
  /** The computed option, to draw it in coloured stretches; null for the standard route. */
  option: SmartRouteOption | null;
  /** Which walking-map build the edge ids belong to (feedback is stored per build). */
  buildId: number | null;
};

export function fromSmartOption(o: SmartRouteOption, buildId: number | null): FollowRoute {
  return {
    title: `${PROFILE_LABELS[o.profile].en} route`,
    profile: o.profile,
    coordinates: o.coordinates,
    steps: o.steps,
    duration_s: o.duration_s,
    distance_m: o.distance_m,
    edgeIds: o.edge_ids,
    closing: o.closing,
    option: o,
    buildId,
  };
}

export function fromStandardRoute(r: PlanRouteResponse): FollowRoute {
  return {
    title: 'Standard walking route',
    profile: null,
    coordinates: r.coordinates,
    steps: r.steps ?? [],
    duration_s: r.duration_s,
    distance_m: r.distance_m,
    edgeIds: [],
    closing: [],
    option: null,
    buildId: null,
  };
}

/**
 * A new route from `from` to `to`. Computed routes keep the same profile (and avoid blocked paths
 * and closed doors); if smart routing isn't available here we fall back to the standard route.
 * `profile` null = the standard route was being followed: re-plan with the standard route, unless
 * `preferComputed` (a blocked path — only computed routes know to avoid it).
 */
export async function planFrom(args: {
  from: LatLng;
  to: LatLng;
  profile: RoutingProfile | null;
  condition: ConditionMode;
  preferComputed?: boolean;
}): Promise<FollowRoute> {
  if (args.profile !== null || args.preferComputed) {
    try {
      const res = await smartRoute({
        origin: args.from,
        destination: args.to,
        profile: args.profile ?? 'fastest',
        condition: args.condition,
      });
      const option =
        res.status === 'ok'
          ? (res.options.find((o) => o.roles.includes('requested')) ?? res.options[0])
          : undefined;
      if (option) return fromSmartOption(option, res.graph?.build_id ?? null);
    } catch (err) {
      console.warn('[follow] smart re-plan failed, using the standard route', err);
    }
  }
  return fromStandardRoute(await planRoute(args.from, args.to));
}

/** The best computed route for a weather condition from where you are, or null if none. */
export async function bestRouteFor(args: {
  from: LatLng;
  to: LatLng;
  condition: ConditionMode;
}): Promise<FollowRoute | null> {
  try {
    const res = await smartRoute({
      origin: args.from,
      destination: args.to,
      profile: PROFILE_FOR_CONDITION[args.condition],
      condition: args.condition,
    });
    const best = res.options.find((o) => o.roles.includes('best_now'));
    return res.status === 'ok' && best ? fromSmartOption(best, res.graph?.build_id ?? null) : null;
  } catch (err) {
    console.warn('[follow] could not check the route for the new weather', err);
    return null;
  }
}
