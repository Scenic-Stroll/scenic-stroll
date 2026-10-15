/**
 * GPS processing for route recording. Pure functions: easy to test, used on the phone.
 *
 * Pipeline:  raw samples → acceptSample (live, per sample) → findGaps (for the review screen)
 *            → trimEnds (privacy, optional) → simplify (Douglas–Peucker) → upload
 */
import { haversineMeters, pathLengthMeters } from './geo.ts';
import type { LatLng } from './schemas.ts';

export type GpsSample = LatLng & {
  /** Radius of uncertainty in metres, as reported by the phone. null = unknown. */
  accuracy: number | null;
  /** Milliseconds since epoch. */
  timestamp: number;
};

/** All thresholds in one place (values from the build prompt). */
export const GPS_RULES = {
  /** Discard samples less accurate than this. */
  maxAccuracyM: 30,
  /** Faster than this between two samples = a GPS jump, not walking. */
  maxSpeedMps: 3,
  /** No accepted sample for this long = a gap (indoors / underground). */
  gapSeconds: 20,
  /** Douglas–Peucker tolerance. */
  simplifyToleranceM: 3,
  /** Privacy trim at each end. */
  trimMeters: 50,
} as const;

export type RejectReason = 'inaccurate' | 'too_fast' | 'out_of_order';

/**
 * Should `next` be added to the track, given the last ACCEPTED sample?
 * Comparing with the last accepted sample (not the last received) means one bad jump can't
 * poison the samples after it.
 */
export function acceptSample(
  last: GpsSample | null,
  next: GpsSample,
): { ok: true } | { ok: false; reason: RejectReason } {
  if (next.accuracy !== null && next.accuracy > GPS_RULES.maxAccuracyM) {
    return { ok: false, reason: 'inaccurate' };
  }
  if (last === null) return { ok: true };

  const seconds = (next.timestamp - last.timestamp) / 1000;
  if (seconds <= 0) return { ok: false, reason: 'out_of_order' };
  if (haversineMeters(last, next) / seconds > GPS_RULES.maxSpeedMps) {
    return { ok: false, reason: 'too_fast' };
  }
  return { ok: true };
}

/** Runs acceptSample over a whole list (used again before upload, as a safety net). */
export function filterSamples(samples: readonly GpsSample[]): GpsSample[] {
  const kept: GpsSample[] = [];
  for (const sample of samples) {
    if (acceptSample(kept.at(-1) ?? null, sample).ok) kept.push(sample);
  }
  return kept;
}

export type Gap = {
  /** Index of the last sample before the gap. */
  fromIndex: number;
  /** Index of the first sample after the gap. */
  toIndex: number;
  seconds: number;
  meters: number;
};

/** Places where GPS went quiet for a while (lifts, malls, MTR). Drawn dashed; user adds a checkpoint. */
export function findGaps(samples: readonly GpsSample[]): Gap[] {
  const gaps: Gap[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    const seconds = (b.timestamp - a.timestamp) / 1000;
    if (seconds > GPS_RULES.gapSeconds) {
      gaps.push({ fromIndex: i - 1, toIndex: i, seconds, meters: haversineMeters(a, b) });
    }
  }
  return gaps;
}

/**
 * Removes the first and last `meters` of the path so a route doesn't reveal exactly where
 * someone lives or works. Returns null if the route is too short to trim and still have a line.
 */
export function trimEnds<T extends LatLng>(
  points: readonly T[],
  meters: number = GPS_RULES.trimMeters,
): T[] | null {
  const total = pathLengthMeters(points);
  const kept: T[] = [];
  let walked = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) walked += haversineMeters(points[i - 1]!, points[i]!);
    if (walked >= meters && walked <= total - meters) kept.push(points[i]!);
  }
  return kept.length >= 2 ? kept : null;
}

/**
 * Douglas–Peucker simplification: drops points that lie within `toleranceM` of the line between
 * their neighbours. Keeps the first and last point. Works on any point type (keeps the objects).
 */
export function simplify<T extends LatLng>(
  points: readonly T[],
  toleranceM: number = GPS_RULES.simplifyToleranceM,
): T[] {
  if (points.length <= 2) return [...points];

  // Project to flat metres around the first point. At walking scale (a few km) this is accurate
  // to well under 1 %, and makes "distance from a line" simple geometry.
  const origin = points[0]!;
  const mPerDegLat = 110_540;
  const mPerDegLng = 111_320 * Math.cos((origin.lat * Math.PI) / 180);
  const xy = points.map((p) => ({
    x: (p.lng - origin.lng) * mPerDegLng,
    y: (p.lat - origin.lat) * mPerDegLat,
  }));

  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  // Iterative (not recursive) so long recordings can't overflow the stack.
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let maxDistance = 0;
    let maxIndex = -1;
    for (let i = start + 1; i < end; i++) {
      const d = distanceToSegment(xy[i]!, xy[start]!, xy[end]!);
      if (d > maxDistance) {
        maxDistance = d;
        maxIndex = i;
      }
    }
    if (maxIndex !== -1 && maxDistance > toleranceM) {
      keep[maxIndex] = true;
      stack.push([start, maxIndex], [maxIndex, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

type XY = { x: number; y: number };

/** Shortest distance from p to the segment a–b (flat coordinates). */
function distanceToSegment(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  // a and b are the same point → distance to that point.
  const t =
    lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
