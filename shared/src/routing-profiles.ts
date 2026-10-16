/**
 * How long each piece of path takes to walk, and how much each route preference dislikes it.
 * THE place to tune smart routing: change a weight, run `npm test` and `npm run graph:try`.
 *
 * Cost of walking one edge = time in seconds × a few multipliers (1 = no change):
 *   × (1 + sun   × exposed × sun strength)  exposed = 1 − shade at the time you walk it (0 under
 *                                 cover/indoors; 0.5 when unknown); sun strength 0 at night
 *   × (1 + rain  × uncovered)      uncovered = 1 when not covered and not indoor
 *   × (1 − ac    × air-conditioned) never below 0.3, so a mall is preferred but not "free"
 *   × (1 + slope × (slope% − 5) / 10) only above 5 %
 *   × (1 − community × score)       walkers' feedback for what this route promises, −1…1
 *                                   (edge-feedback.ts; 0 without feedback)
 * and for step-free: stairs and escalators are impossible, "unknown" access costs ×3.
 * No language model is involved anywhere here: same inputs, same route, every time.
 */
import type { ConditionMode } from './conditions.ts';
import { aspectForProfile } from './edge-feedback.ts';
import type { RoutingEdge } from './graph-export.ts';
import { shadeBucket, type ShadeMeta } from './shadows.ts';

export const ROUTING_PROFILES = [
  'fastest',
  'balanced',
  'sheltered',
  'shaded',
  'cool',
  'step_free',
] as const;
export type RoutingProfile = (typeof ROUTING_PROFILES)[number];

export type ProfileWeights = {
  sun: number;
  rain: number;
  ac: number;
  slope: number;
  community: number;
  /** true = no stairs or escalators at all. */
  stepFree: boolean;
};

export const PROFILE_WEIGHTS: Record<RoutingProfile, ProfileWeights> = {
  // Shortest time, nothing else matters.
  fastest: { sun: 0, rain: 0, ac: 0, slope: 0, community: 0, stepFree: false },
  // A little cover and a gentle slope are worth a small detour.
  balanced: { sun: 0.3, rain: 0.3, ac: 0.1, slope: 0.3, community: 0.2, stepFree: false },
  // Rain: an uncovered metre "feels" 4× as long as a covered one.
  sheltered: { sun: 0, rain: 3, ac: 0.1, slope: 0.2, community: 0.2, stepFree: false },
  // Sun: stay in the shade of buildings, trees and covers.
  shaded: { sun: 2, rain: 0, ac: 0.2, slope: 0.3, community: 0.2, stepFree: false },
  // Heat: shade AND air-conditioning.
  cool: { sun: 2, rain: 0, ac: 0.5, slope: 0.5, community: 0.2, stepFree: false },
  // Wheelchairs, prams, luggage: no steps; avoid steep slopes.
  step_free: { sun: 0, rain: 0, ac: 0, slope: 1, community: 0.2, stepFree: true },
};

/** Which profile "Best now" uses for each weather condition. */
export const PROFILE_FOR_CONDITION: Record<ConditionMode, RoutingProfile> = {
  normal: 'balanced',
  rain: 'sheltered',
  heat: 'cool',
  night: 'fastest', // lighting isn't in our data yet; closed indoor links are already avoided
  typhoon_or_black_rain: 'sheltered',
};

export const PROFILE_LABELS: Record<RoutingProfile, { en: string; zh: string }> = {
  fastest: { en: 'Fastest', zh: '最快' },
  balanced: { en: 'Balanced', zh: '平衡' },
  sheltered: { en: 'Sheltered', zh: '有蓋' },
  shaded: { en: 'Shaded', zh: '有遮蔭' },
  cool: { en: 'Coolest', zh: '最清涼' },
  step_free: { en: 'Step-free', zh: '無梯級' },
};

// ---- walking time --------------------------------------------------------------------------

export const WALK_SPEED_MPS = 1.3;
/** On stairs and on slopes steeper than STEEP_SLOPE_PCT. */
export const SLOW_SPEED_MPS = 0.9;
export const STEEP_SLOPE_PCT = 8;
export const ESCALATOR_SPEED_MPS = 0.6;
export const LIFT_WAIT_S = 40;
export const LIFT_PER_FLOOR_S = 10;
export const FLOOR_HEIGHT_M = 3.5;

/** Length including the climb, for stairs and escalators (their map length is short). */
const length3d = (e: RoutingEdge) => Math.hypot(e.length_m, e.z_to - e.z_from);

/** Seconds to walk (or ride) an edge, including the wait at a crossing. */
export function edgeTimeS(e: RoutingEdge): number {
  switch (e.kind) {
    case 'lift': {
      const floors = Math.max(1, Math.round(Math.abs(e.z_to - e.z_from) / FLOOR_HEIGHT_M));
      return LIFT_WAIT_S + LIFT_PER_FLOOR_S * floors;
    }
    case 'escalator':
      return length3d(e) / ESCALATOR_SPEED_MPS;
    case 'stairs':
      return length3d(e) / SLOW_SPEED_MPS;
    default: {
      const speed = e.slope_pct > STEEP_SLOPE_PCT ? SLOW_SPEED_MPS : WALK_SPEED_MPS;
      return e.length_m / speed + e.crossing_wait_s;
    }
  }
}

/**
 * How strong the sun is, 0–1: 0 when it is down, 1 when it is 45° or higher. Weights the "sun"
 * term, so at 5 pm (low sun) a sunny street matters less than at noon, and not at all at night.
 */
export function sunStrength(altitudeDeg: number): number {
  if (altitudeDeg <= 0) return 0;
  return Math.min(1, Math.sin((altitudeDeg * Math.PI) / 180) / Math.sin(Math.PI / 4));
}

/**
 * How shaded an edge is (0–1) at a moment: 1 under cover or indoors; else the precomputed value for
 * the nearest half hour; null when unknown (no shade computed, or before 07:00 / after 19:00).
 */
export function edgeShadeAt(e: RoutingEdge, when: Date, meta: ShadeMeta | null): number | null {
  if (e.covered || e.indoor) return 1;
  if (!meta || !e.shade) return null;
  const i = shadeBucket(when, meta, e.shade.length);
  return i === null ? null : (e.shade[i] ?? 0) / 100;
}

/** What edgeCost needs to know about the moment you walk the edge. */
export type CostContext = {
  /** 0–1 from edgeShadeAt; null = unknown. */
  shade: number | null;
  /** 0–1 from sunStrength. */
  sun: number;
};

/** Without shade data or a time: covered/indoor is shade, other paths count as half-exposed. */
const DEFAULT_CONTEXT: CostContext = { shade: null, sun: 1 };

/** Lifts, stairs and escalators have their own speeds, so slope doesn't apply to them. */
const HAS_OWN_SPEED = new Set(['lift', 'stairs', 'escalator']);

/** The routing cost of an edge for a profile, or null if the profile can't use it. */
export function edgeCost(
  e: RoutingEdge,
  profile: RoutingProfile,
  ctx: CostContext = DEFAULT_CONTEXT,
): number | null {
  const w = PROFILE_WEIGHTS[profile];
  if (w.stepFree && e.step_free === 'no') return null;

  const sheltered = e.covered || e.indoor;
  const exposed = sheltered ? 0 : ctx.shade === null ? 0.5 : 1 - ctx.shade;
  let factor = 1;
  factor *= 1 + w.sun * exposed * ctx.sun;
  factor *= 1 + w.rain * (sheltered ? 0 : 1);
  factor *= Math.max(0.3, 1 - w.ac * (e.air_conditioned ? 1 : 0));
  if (!HAS_OWN_SPEED.has(e.kind)) factor *= 1 + (w.slope * Math.max(0, e.slope_pct - 5)) / 10;
  factor *= 1 - w.community * (e.community?.[aspectForProfile(profile)] ?? 0);
  if (w.stepFree && e.step_free === 'unknown') factor *= 3;
  return edgeTimeS(e) * factor;
}
