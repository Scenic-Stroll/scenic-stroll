/**
 * Points calculations (D55). Pure functions over POINTS_RULES, used by the award-points Edge
 * Function (which never trusts a points amount from the app) and by the app to show the ring.
 */
import { haversineMeters } from './geo.ts';
import type { GpsSample } from './gps.ts';
import { POINTS_RULES } from './pointsRules.ts';

/** 0.75 km = 1,000 steps. */
export function stepsFromMeters(meters: number): number {
  return (Math.max(0, meters) * 1000) / POINTS_RULES.metersPer1000Steps;
}

/** Distance points for a whole day's steps: the tiers, in proportion, rounded down, capped. */
export function distancePointsForDay(steps: number): number {
  let points = 0;
  for (const tier of POINTS_RULES.distanceTiers) {
    const inTier = Math.min(steps, tier.toSteps) - tier.fromSteps;
    if (inTier > 0) points += (inTier / 1000) * tier.pointsPer1000Steps;
  }
  return Math.min(Math.floor(points + 1e-9), POINTS_RULES.dailyMaxDistancePoints);
}

/**
 * How many points one more walk adds to a day that already had `stepsBefore` steps. Summing these
 * over the day's walks gives exactly distancePointsForDay(total) — the cap and tiers apply per day.
 */
export function distancePointsAdded(stepsBefore: number, walkSteps: number): number {
  return distancePointsForDay(stepsBefore + walkSteps) - distancePointsForDay(stepsBefore);
}

/** The calendar day in Hong Kong ("2026-11-23") of a time in milliseconds. */
export function hkDay(ms: number): string {
  return new Date(ms + POINTS_RULES.utcOffsetHours * 3600_000).toISOString().slice(0, 10);
}

/**
 * Splits a walk (already through the GPS filter) into metres that count and metres that were too
 * fast, per Hong Kong day. A stretch between two fixes is too fast when the average speed over the
 * surrounding window of at least speedWindowSeconds is above maxSpeedKmh.
 */
export function walkMetersByDay(
  samples: readonly GpsSample[],
): Record<string, { countedM: number; tooFastM: number }> {
  const pts = [...samples].sort((a, b) => a.timestamp - b.timestamp);
  const segM = pts.slice(1).map((p, i) => haversineMeters(pts[i]!, p));
  const windowMs = POINTS_RULES.speedWindowSeconds * 1000;
  const maxMps = POINTS_RULES.maxSpeedKmh / 3.6;
  const out: Record<string, { countedM: number; tooFastM: number }> = {};

  for (let i = 0; i < segM.length; i++) {
    // Grow a window around segment i (forward first, then backward) until it spans ≥ 30 s.
    let start = i;
    let end = i + 1;
    while (pts[end]!.timestamp - pts[start]!.timestamp < windowMs && end < pts.length - 1) end++;
    while (pts[end]!.timestamp - pts[start]!.timestamp < windowMs && start > 0) start--;
    const seconds = (pts[end]!.timestamp - pts[start]!.timestamp) / 1000;
    let meters = 0;
    for (let k = start; k < end; k++) meters += segM[k]!;
    const tooFast = seconds > 0 && meters / seconds > maxMps;

    const day = hkDay(pts[i + 1]!.timestamp);
    const bucket = (out[day] ??= { countedM: 0, tooFastM: 0 });
    if (tooFast) bucket.tooFastM += segM[i]!;
    else bucket.countedM += segM[i]!;
  }
  return out;
}

/** May this pin read earn points? Collected, read long enough, and not awarded before. */
export function pinReadEarns(read: {
  collected: boolean;
  openedAtMs: number;
  finishedAtMs: number;
  alreadyAwarded: boolean;
}): boolean {
  return (
    read.collected &&
    !read.alreadyAwarded &&
    read.finishedAtMs - read.openedAtMs >= POINTS_RULES.pinRead.minReadSeconds * 1000
  );
}

/** The daily ring: steps today out of the goal, 0–1. */
export function ringProgress(stepsToday: number): number {
  return Math.min(1, Math.max(0, stepsToday / POINTS_RULES.dailyStepGoal));
}
