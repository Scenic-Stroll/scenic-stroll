/**
 * Plans the smart route options for one trip: the profile the user picked, the best profile for
 * the weather ("Best now") and the fastest route — dropping near-duplicates (> 80 % shared) — plus,
 * if there is room, one genuinely different alternative for the profile the user picked. If a route
 * passes an indoor link that closes soon after you'd get there, that alternative goes around it.
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
/** How many times we try to route around closing links before giving up (see routeAroundClosing). */
const AROUND_CLOSING_ROUNDS = 4;

export type PlanInput = {
  origin: LatLng;
  destination: LatLng;
  profile: RoutingProfile;
  departure: Date;
  condition: ConditionMode;
  conditionSource: 'given' | 'live';
  /** Edge ids walkers reported blocked (public.path_reports): no route uses them. */
  blocked?: ReadonlySet<number>;
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
    blocked_paths: 0,
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
  const blocked = input.blocked ?? new Set<number>();
  const blockedPaths = g.edges.filter((e) => blocked.has(e.id)).length;
  const route = (profile: RoutingProfile) =>
    findRoute(g, {
      origin: input.origin,
      destination: input.destination,
      profile,
      departure: input.departure,
      sun,
      blocked,
    });
  const summarize = (found: FoundRoute) =>
    summarizeRoute(found, input.origin, input.destination, {
      departure: input.departure,
      shadeMeta: g.shadeMeta,
      sun,
    });

  const fastest = route('fastest');
  if (!fastest) return { ...base, status: 'no_route', blocked_paths: blockedPaths };

  // In order of importance: what the user asked for, what suits the weather, the quickest.
  const wanted: { profile: RoutingProfile; role: SmartRouteOption['roles'][number] }[] = [
    { profile: input.profile, role: 'requested' },
    { profile: best, role: 'best_now' },
    { profile: 'fastest', role: 'fastest' },
  ];

  const picked: {
    profile: RoutingProfile;
    roles: SmartRouteOption['roles'];
    found: FoundRoute;
    avoidsClosing?: boolean;
  }[] = [];
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

  // The alternative search: the requested profile, with extra edges blocked or penalised.
  const altQuery = {
    origin: input.origin,
    destination: input.destination,
    profile: input.profile,
    departure: input.departure,
    sun,
  };
  const penaltiesFor = (routes: { found: FoundRoute }[]) => {
    const penalties = new Map<number, number>();
    for (const r of routes)
      for (const l of r.found.legs) penalties.set(l.edge.id, ALTERNATIVE_PENALTY);
    return penalties;
  };
  // Around links that close soon. Going around one can lead through another with the same hours
  // (Festival Walk has several floors), so repeat a few times; null if every way still passes one.
  const routeAroundClosing = (closingIds: number[]): FoundRoute | null => {
    const avoid = new Set([...blocked, ...closingIds]);
    for (let round = 0; round < AROUND_CLOSING_ROUNDS; round++) {
      const found = findRoute(g, { ...altQuery, blocked: avoid });
      if (!found) return null;
      const more = summarize(found).closingEdgeIds;
      if (more.length === 0) return found;
      for (const id of more) avoid.add(id);
    }
    return null;
  };

  // One alternative for the requested profile. If an offered route passes a link that closes soon
  // after you'd reach it, the alternative goes around those links (and is offered even if it's
  // much longer — it's the safe choice). Otherwise it's a penalty-based alternative: only if it is
  // really different from every route offered (at most 80 % shared) and not much longer.
  if (picked.length < MAX_OPTIONS) {
    const closingIds = picked.flatMap((p) => summarize(p.found).closingEdgeIds);
    const alt =
      closingIds.length > 0
        ? routeAroundClosing(closingIds)
        : findRoute(g, { ...altQuery, blocked, penalties: penaltiesFor(picked) });
    const avoidsClosing = closingIds.length > 0;
    if (alt) {
      const same = picked.find(
        (p) =>
          Math.min(overlapRatio(alt, p.found), overlapRatio(p.found, alt)) > SAME_ROUTE_OVERLAP,
      );
      const different = picked.every(
        (p) =>
          Math.max(overlapRatio(alt, p.found), overlapRatio(p.found, alt)) <= SAME_ROUTE_OVERLAP,
      );
      // A route already offered that is clear of closing links (often the fastest): say so
      // instead of listing it twice.
      const sameIsClear = same !== undefined && summarize(same.found).closingEdgeIds.length === 0;
      if (avoidsClosing && same && sameIsClear) {
        same.avoidsClosing = true;
      } else if (avoidsClosing || (different && alt.timeS <= fastestS * DETOUR_CAP)) {
        picked.push({ profile: input.profile, roles: ['alternative'], found: alt, avoidsClosing });
      }
    }
  }

  const options = picked.map(({ profile, roles, found, avoidsClosing }): SmartRouteOption => {
    const s = summarize(found);
    const { edgeIds, closingEdgeIds: _closingEdgeIds, ...shown } = s;
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
      edge_ids: edgeIds,
      avoids_closing: avoidsClosing ?? false,
    };
  });

  return { ...base, status: 'ok', unavailable, options, blocked_paths: blockedPaths };
}
