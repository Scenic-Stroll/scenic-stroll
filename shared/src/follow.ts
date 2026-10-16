/**
 * Follow mode ("turn-by-turn lite") as plain logic, so it can be unit-tested: where you are along
 * the route, whether you've wandered off it, which instruction is next, whether a blocked-path report
 * or a closing door affects the rest of your walk, and what to say when the weather changes.
 * The app's follow screen calls these with every GPS fix (or simulated position in demo mode).
 */
import type { ConditionMode } from './conditions.ts';
import { formatDuration } from './format.ts';
import type { ClosingWarning } from './route-summary.ts';
import { WALK_SPEED_MPS, type RoutingProfile } from './routing-profiles.ts';
import type { LatLng } from './schemas.ts';
import { makeProjection, type XY } from './shadows.ts';

/** Off route = more than 40 m from the line for more than 20 s (the brief's numbers). */
export const OFF_ROUTE_M = 40;
export const OFF_ROUTE_S = 20;
/** Within this of the destination = arrived. */
export const ARRIVED_M = 25;
/**
 * GPS fixes less accurate than this are ignored for "off route". Why: indoors (Festival Walk, MTR)
 * GPS can be 100 m out, and we must not re-plan just because the phone lost the sky.
 */
export const MAX_FIX_ACCURACY_M = 50;

// ---- where am I on the route? --------------------------------------------------------------

export type RoutePosition = {
  /** Distance from the route line, metres. */
  distM: number;
  /** How far along the route the nearest point is, metres from the start. */
  alongM: number;
  totalM: number;
};

/** Projects the line to metres once; reuse it for many positions. */
function measure(line: LatLng[]) {
  const proj = makeProjection(line[0]!);
  const pts = line.map(proj.toXY);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  }
  return { proj, pts, cum };
}

/** The nearest point of the route line to `p`: how far off it you are, and how far along. */
export function locateOnRoute(line: LatLng[], p: LatLng): RoutePosition {
  if (line.length === 0) return { distM: Infinity, alongM: 0, totalM: 0 };
  const { proj, pts, cum } = measure(line);
  const q = proj.toXY(p);
  let best = { distM: Math.hypot(q.x - pts[0]!.x, q.y - pts[0]!.y), alongM: 0 };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const t =
      len2 === 0
        ? 0
        : Math.max(0, Math.min(1, ((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / len2));
    const c: XY = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
    const distM = Math.hypot(q.x - c.x, q.y - c.y);
    if (distM < best.distM) best = { distM, alongM: cum[i - 1]! + t * (cum[i]! - cum[i - 1]!) };
  }
  return { ...best, totalM: cum.at(-1)! };
}

/**
 * The point `alongM` metres along the line, moved `sidewaysM` to the left of the direction of
 * travel (negative = right). Used by the demo "simulate walk" and to report "blocked ahead".
 */
export function pointAlong(line: LatLng[], alongM: number, sidewaysM = 0): LatLng {
  if (line.length < 2) return line[0]!;
  const { proj, pts, cum } = measure(line);
  const target = Math.max(0, Math.min(alongM, cum.at(-1)!));
  let i = 1;
  while (i < pts.length - 1 && cum[i]! < target) i++;
  const a = pts[i - 1]!;
  const b = pts[i]!;
  const segLen = cum[i]! - cum[i - 1]! || 1;
  const t = (target - cum[i - 1]!) / segLen;
  // Left of the direction a → b is (-dy, dx).
  const nx = -(b.y - a.y) / segLen;
  const ny = (b.x - a.x) / segLen;
  return proj.toLatLng({
    x: a.x + t * (b.x - a.x) + nx * sidewaysM,
    y: a.y + t * (b.y - a.y) + ny * sidewaysM,
  });
}

// ---- off route -----------------------------------------------------------------------------

/** When you first went off route (ms), or null while you're on it. */
export type OffRouteState = { since: number | null };

/**
 * Feed every position fix in. Returns the new state, how long you've been off route and whether
 * it's time to re-plan (> OFF_ROUTE_M for ≥ OFF_ROUTE_S). Inaccurate fixes change nothing.
 */
export function trackOffRoute(
  state: OffRouteState,
  fix: { distM: number; accuracyM: number | null; atMs: number },
): { state: OffRouteState; secondsOff: number; replan: boolean } {
  if (fix.accuracyM !== null && fix.accuracyM > MAX_FIX_ACCURACY_M) {
    const secondsOff = state.since === null ? 0 : (fix.atMs - state.since) / 1000;
    return { state, secondsOff, replan: false };
  }
  if (fix.distM <= OFF_ROUTE_M) return { state: { since: null }, secondsOff: 0, replan: false };
  const since = state.since ?? fix.atMs;
  const secondsOff = (fix.atMs - since) / 1000;
  return { state: { since }, secondsOff, replan: secondsOff >= OFF_ROUTE_S };
}

// ---- instructions and time left ------------------------------------------------------------

/** Which step you're on, from how far along you are (steps carry their own distances). */
export function stepIndexAt(steps: { distance_m: number }[], alongM: number): number {
  let end = 0;
  for (let i = 0; i < steps.length; i++) {
    end += steps[i]!.distance_m;
    if (alongM < end) return i;
  }
  return Math.max(0, steps.length - 1);
}

/** Time left, assuming the rest of the route takes its share of the planned time. */
export function remainingSeconds(durationS: number, pos: RoutePosition): number {
  if (pos.totalM <= 0) return 0;
  return (durationS * Math.max(0, pos.totalM - pos.alongM)) / pos.totalM;
}

// ---- things that change the plan -----------------------------------------------------------

/** Has a blocked-path report hit the part of the route still ahead of you? */
export function reportHitsRoute(
  report: { edge_id: number; point: LatLng },
  route: { line: LatLng[]; edgeIds: number[] },
  alongM: number,
): boolean {
  // Computed routes know their edges; the standard street route only has a line (then: ≤ 15 m).
  if (route.edgeIds.length > 0 && !route.edgeIds.includes(report.edge_id)) return false;
  const loc = locateOnRoute(route.line, report.point);
  if (route.edgeIds.length === 0 && loc.distM > 15) return false;
  return loc.alongM >= alongM - 10; // behind you = doesn't matter any more
}

/** Re-plan if you'd get there less than this before it closes. */
const CLOSING_MARGIN_MS = 2 * 60_000;

/**
 * The first closing link ahead that you won't reach in time at walking speed (minus 2 minutes'
 * margin), or null. E.g. you stopped for coffee and Festival Walk shuts before you get there.
 */
export function missedClosing(
  closing: ClosingWarning[],
  line: LatLng[],
  alongM: number,
  now: Date,
): ClosingWarning | null {
  for (const c of closing) {
    const at = locateOnRoute(line, c.point).alongM;
    if (at < alongM - 10) continue; // already through it
    const reach = now.getTime() + ((at - alongM) / WALK_SPEED_MPS) * 1000;
    if (reach >= new Date(c.closes_at).getTime() - CLOSING_MARGIN_MS) return c;
  }
  return null;
}

/** Are two computed routes basically the same (> 80 % of edges shared)? */
export function sameEdges(a: number[], b: number[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const inB = new Set(b);
  return a.filter((id) => inB.has(id)).length / a.length > 0.8;
}

// ---- the weather changed while walking ------------------------------------------------------

const HEADLINES: Record<ConditionMode, string> = {
  rain: 'It’s started raining',
  heat: 'It’s very hot now',
  night: 'It’s getting dark',
  typhoon_or_black_rain: 'Severe weather warning',
  normal: 'Conditions have eased',
};

const ROUTE_WORDS: Record<RoutingProfile, string> = {
  sheltered: 'a sheltered route',
  cool: 'a cooler route',
  shaded: 'a shadier route',
  fastest: 'a quicker route',
  balanced: 'a different route',
  step_free: 'a step-free route',
};

/**
 * The banner when the condition changes mid-walk, e.g.
 * "It's started raining — a sheltered route via Festival Walk LG1 adds 2 min. Switch?"
 * `candidate` = the best route for the new condition from where you are (null = none found);
 * `same` = it's basically the route you're on.
 */
export function conditionChangeMessage(args: {
  from: ConditionMode;
  to: ConditionMode;
  candidate: { profile: RoutingProfile; duration_s: number; viaIndoor: string | null } | null;
  remainingS: number;
  same: boolean;
}): { text: string; offerSwitch: boolean } {
  const head =
    args.to === 'normal' && args.from === 'rain' ? 'The rain has stopped' : HEADLINES[args.to];
  const c = args.candidate;
  if (!c) return { text: `${head} — no better route from here, keep going.`, offerSwitch: false };
  if (args.same) {
    return { text: `${head} — you’re already on the best route for it.`, offerSwitch: false };
  }
  const delta = c.duration_s - args.remainingS;
  const time =
    delta >= 60
      ? `adds ${formatDuration(delta)}`
      : delta <= -60
        ? `saves ${formatDuration(-delta)}`
        : 'takes about the same time';
  const via = c.viaIndoor ? ` via ${c.viaIndoor}` : '';
  return { text: `${head} — ${ROUTE_WORDS[c.profile]}${via} ${time}. Switch?`, offerSwitch: true };
}
