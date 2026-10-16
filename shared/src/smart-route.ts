/**
 * Plans the smart route options for one trip: the profile the user picked, the best profile for
 * the weather ("Best now") and the fastest route — dropping near-duplicates (> 80 % shared) — plus,
 * if there is room, one genuinely different alternative for the profile the user picked.
 * Pure function: the Edge Function, tests and the try-out script all call this.
 */
import { CONDITIONS_POINT, type ConditionMode } from './conditions.ts';
import { isInGraphArea } from './graph-area.ts';
import { explain, overlapRatio, summarizeRoute } from './route-summary.ts';
import { findRoute, type FoundRoute, type PreparedGraph } from './router.ts';
import { PROFILE_FOR_CONDITION, sunStrength, type RoutingProfile } from './routing-profiles.ts';
import type { LatLng } from './schemas.ts';
import type { SmartRouteOption, SmartRouteResponse } from './smart-route-api.ts';
import { sunPosition } from './sun.ts';

/** Routes sharing more than this much of their length count as the same route. */
export const SAME_ROUTE_OVERLAP = 0.8;
/** A preference route longer than this × the fastest time is flagged "much longer". */
export const DETOUR_CAP = 1.4;
/** At most this many options (the brief: 2–4). */
export const MAX_OPTIONS = 4;
/**
 * To find an alternative, edges of the routes already offered cost this much more; the search then
 * prefers other streets where they are nearly as good (penalty-based alternatives).
 */
export const ALTERNATIVE_PENALTY = 1.5;

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
    graph: g
      ? {
          build_id: g.buildId,
          source: g.source,
          version: g.version,
          shade_date: g.shadeMeta?.date ?? null,
        }
      : null,
    options: [] as SmartRouteOption[],
  };
  // Area first: the Edge Function doesn't even load the graph for trips outside it.
  if (!isInGraphArea(input.origin) || !isInGraphArea(input.destination)) {
    return { ...base, status: 'outside_area' };
  }
  if (!g) return { ...base, status: 'no_graph' };

  // The sun barely moves during a walk of a few minutes, so its strength is read once.
  const sun = sunStrength(
    sunPosition(input.departure, CONDITIONS_POINT.lat, CONDITIONS_POINT.lng).altitude_deg,
  );
  const route = (profile: RoutingProfile) =>
    findRoute(g, {
      origin: input.origin,
      destination: input.destination,
      profile,
      departure: input.departure,
      sun,
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

  // One alternative for the requested profile: only if it is really different from every route
  // already offered (at most 80 % shared either way) and not much longer than the fastest.
  if (picked.length < MAX_OPTIONS) {
    const penalties = new Map<number, number>();
    for (const p of picked)
      for (const l of p.found.legs) penalties.set(l.edge.id, ALTERNATIVE_PENALTY);
    const alt = findRoute(g, {
      origin: input.origin,
      destination: input.destination,
      profile: input.profile,
      departure: input.departure,
      sun,
      penalties,
    });
    const different =
      alt !== null &&
      picked.every(
        (p) =>
          Math.max(overlapRatio(alt, p.found), overlapRatio(p.found, alt)) <= SAME_ROUTE_OVERLAP,
      );
    if (alt && different && alt.timeS <= fastestS * DETOUR_CAP) {
      picked.push({ profile: input.profile, roles: ['alternative'], found: alt });
    }
  }

  const options = picked.map(({ profile, roles, found }): SmartRouteOption => {
    const s = summarizeRoute(found, input.origin, input.destination, {
      departure: input.departure,
      shadeMeta: g.shadeMeta,
      sun,
    });
    const { edgeIds: _edgeIds, ...shown } = s;
    return {
      id: roles.includes('alternative') ? `${profile}-alt` : profile,
      profile,
      roles,
      ...shown,
      much_longer: found.timeS > fastestS * DETOUR_CAP,
      extra_s_vs_fastest: Math.round(found.timeS - fastestS),
      explanation: explain(s, found, profile === 'fastest' ? null : fastestS, input.departure),
      estimated: [
        ...(s.pct_air_conditioned > 0 ? ['air_conditioned'] : []),
        ...(s.pct_shaded !== null ? ['shade'] : []),
      ],
    };
  });

  return { ...base, status: 'ok', unavailable, options };
}
