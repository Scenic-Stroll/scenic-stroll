/**
 * Plans the smart route options for one trip: the profile the user picked, the best profile for
 * the weather ("Best now") and the fastest route — dropping near-duplicates (> 80 % shared).
 * Pure function: the Edge Function, tests and the try-out script all call this.
 */
import type { ConditionMode } from './conditions.ts';
import { isInGraphArea } from './graph-area.ts';
import { explain, overlapRatio, summarizeRoute } from './route-summary.ts';
import { findRoute, type FoundRoute, type PreparedGraph } from './router.ts';
import { PROFILE_FOR_CONDITION, type RoutingProfile } from './routing-profiles.ts';
import type { LatLng } from './schemas.ts';
import type { SmartRouteOption, SmartRouteResponse } from './smart-route-api.ts';

/** Routes sharing more than this much of their length count as the same route. */
export const SAME_ROUTE_OVERLAP = 0.8;
/** A preference route longer than this × the fastest time is flagged "much longer". */
export const DETOUR_CAP = 1.4;

export type PlanInput = {
  origin: LatLng;
  destination: LatLng;
  profile: RoutingProfile;
  departure: Date;
  condition: ConditionMode;
  conditionSource: 'given' | 'live';
};

export function planSmartRoutes(g: PreparedGraph | null, input: PlanInput): SmartRouteResponse {
  const best = PROFILE_FOR_CONDITION[input.condition];
  const base = {
    condition: input.condition,
    condition_source: input.conditionSource,
    best_profile: best,
    unavailable: [] as RoutingProfile[],
    graph: g ? { build_id: g.buildId, source: g.source, version: g.version } : null,
    options: [] as SmartRouteOption[],
  };
  if (!g) return { ...base, status: 'no_graph' };
  if (!isInGraphArea(input.origin) || !isInGraphArea(input.destination)) {
    return { ...base, status: 'outside_area' };
  }

  const route = (profile: RoutingProfile) =>
    findRoute(g, {
      origin: input.origin,
      destination: input.destination,
      profile,
      departure: input.departure,
    });

  const fastest = route('fastest');
  if (!fastest) return { ...base, status: 'no_route' };

  // In order of importance: what the user asked for, what suits the weather, the quickest.
  const wanted: { profile: RoutingProfile; role: SmartRouteOption['roles'][number] }[] = [
    { profile: input.profile, role: 'requested' },
    { profile: best, role: 'best_now' },
    { profile: 'fastest', role: 'fastest' },
  ];

  const picked: { profile: RoutingProfile; roles: SmartRouteOption['roles']; found: FoundRoute }[] =
    [];
  const unavailable: RoutingProfile[] = [];
  for (const w of wanted) {
    const found = w.profile === 'fastest' ? fastest : route(w.profile);
    if (!found) {
      if (!unavailable.includes(w.profile)) unavailable.push(w.profile);
      continue;
    }
    // Same route as one already picked? Then it just gets another role.
    const same = picked.find(
      (p) =>
        p.profile === w.profile ||
        Math.min(overlapRatio(found, p.found), overlapRatio(p.found, found)) > SAME_ROUTE_OVERLAP,
    );
    if (same) {
      if (!same.roles.includes(w.role)) same.roles.push(w.role);
    } else {
      picked.push({ profile: w.profile, roles: [w.role], found });
    }
  }

  const fastestS = fastest.timeS;
  const options = picked.map(({ profile, roles, found }): SmartRouteOption => {
    const s = summarizeRoute(found, input.origin, input.destination);
    const { edgeIds: _edgeIds, ...shown } = s;
    return {
      id: profile,
      profile,
      roles,
      ...shown,
      much_longer: found.timeS > fastestS * DETOUR_CAP,
      extra_s_vs_fastest: Math.round(found.timeS - fastestS),
      explanation: explain(s, found, profile === 'fastest' ? null : fastestS),
      estimated: s.pct_air_conditioned > 0 ? ['air_conditioned'] : [],
    };
  });

  return { ...base, status: 'ok', unavailable, options };
}
