/**
 * Building and tree shade, as plain geometry (no libraries), for the shade precompute script.
 *
 * A building's shadow at a given sun position: move its footprint away from the sun by
 * height / tan(sun altitude) and take the convex hull of the footprint + the moved footprint.
 * That over-shades a little for L-shaped buildings — good enough for a walking-route estimate, and
 * the app always labels shade "estimated".
 *
 * Coordinates are metres east (x) / north (y) of a nearby origin, so distances are simple.
 */
import { hongKongTime } from './opening-hours.ts';
import type { LatLng } from './schemas.ts';
import type { SunPosition } from './sun.ts';

export type XY = { x: number; y: number };

/** Flat-earth projection around `origin` — accurate to centimetres over a few kilometres. */
export function makeProjection(origin: LatLng) {
  const mPerLat = 110_574;
  const mPerLng = 111_320 * Math.cos((origin.lat * Math.PI) / 180);
  return {
    toXY: (p: LatLng): XY => ({
      x: (p.lng - origin.lng) * mPerLng,
      y: (p.lat - origin.lat) * mPerLat,
    }),
    toLatLng: (q: XY): LatLng => ({
      lng: origin.lng + q.x / mPerLng,
      lat: origin.lat + q.y / mPerLat,
    }),
  };
}

const cross = (o: XY, a: XY, b: XY) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Convex hull, counter-clockwise (Andrew's monotone chain). */
export function convexHull(points: XY[]): XY[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length <= 2) return pts;
  const lower: XY[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: XY[] = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Longest shadow we draw: a low sun makes shadows run on for kilometres; cap them. */
export const MAX_SHADOW_M = 250;

/**
 * The shadow polygon of a building with this footprint and height (metres above the ground around
 * it), or null when the sun is down (no sun to hide from). Height 0 = just the footprint (a canopy).
 */
export function shadowPolygon(footprint: XY[], heightM: number, sun: SunPosition): XY[] | null {
  if (sun.altitude_deg <= 0 || footprint.length < 3) return null;
  const length = Math.min(
    MAX_SHADOW_M,
    Math.max(0, heightM) / Math.tan((sun.altitude_deg * Math.PI) / 180),
  );
  // The shadow falls AWAY from the sun: azimuth is where the sun is (0 = north, 90 = east).
  const az = (sun.azimuth_deg * Math.PI) / 180;
  const dx = -Math.sin(az) * length;
  const dy = -Math.cos(az) * length;
  return convexHull([...footprint, ...footprint.map((p) => ({ x: p.x + dx, y: p.y + dy }))]);
}

/** Is p inside the polygon? (Ray casting; the polygon may be in either winding order.) */
export function pointInPolygon(p: XY, poly: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** A regular polygon around a point — a tree's crown. */
export function circlePolygon(c: XY, radiusM: number, sides = 8): XY[] {
  return Array.from({ length: sides }, (_, i) => {
    const a = (2 * Math.PI * i) / sides;
    return { x: c.x + radiusM * Math.cos(a), y: c.y + radiusM * Math.sin(a) };
  });
}

/** Polygons bucketed into a grid, so "is this point shaded?" only checks nearby polygons. */
export class ShadeIndex {
  private cells = new Map<string, XY[][]>();
  private cellM: number;

  constructor(polygons: XY[][], cellM = 25) {
    this.cellM = cellM;
    for (const poly of polygons) {
      const xs = poly.map((p) => p.x);
      const ys = poly.map((p) => p.y);
      const [x0, x1] = [Math.floor(Math.min(...xs) / cellM), Math.floor(Math.max(...xs) / cellM)];
      const [y0, y1] = [Math.floor(Math.min(...ys) / cellM), Math.floor(Math.max(...ys) / cellM)];
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const key = `${cx},${cy}`;
          const list = this.cells.get(key);
          if (list) list.push(poly);
          else this.cells.set(key, [poly]);
        }
      }
    }
  }
  covers(p: XY): boolean {
    const list = this.cells.get(`${Math.floor(p.x / this.cellM)},${Math.floor(p.y / this.cellM)}`);
    return list?.some((poly) => pointInPolygon(p, poly)) ?? false;
  }
}

/** Share (0–1) of a line that lies in any of the indexes, sampled every `stepM` metres. */
export function lineShadeFraction(line: XY[], indexes: ShadeIndex[], stepM = 2): number {
  let total = 0;
  let shaded = 0;
  const test = (p: XY) => {
    total++;
    if (indexes.some((ix) => ix.covers(p))) shaded++;
  };
  if (line.length === 1) test(line[0]!);
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / stepM));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) {
      test({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
    }
  }
  return total === 0 ? 0 : shaded / total;
}

// ---- time buckets --------------------------------------------------------------------------

/** Shade is stored every 30 min from 07:00 to 19:00 Hong Kong time (25 values per edge). */
export const SHADE_FIRST_MIN = 7 * 60;
export const SHADE_BUCKET_MIN = 30;
export const SHADE_BUCKETS = 25;

export type ShadeMeta = { date: string; firstMin: number; bucketMin: number };

/** Which stored value to use at `date` (nearest 30-min bucket), or null outside 07:00–19:00. */
export function shadeBucket(
  date: Date,
  meta: Pick<ShadeMeta, 'firstMin' | 'bucketMin'>,
  count = SHADE_BUCKETS,
) {
  const { minute } = hongKongTime(date);
  const i = Math.round((minute - meta.firstMin) / meta.bucketMin);
  return i >= 0 && i < count ? i : null;
}

/** The moment bucket `i` stands for, on a Hong Kong date like "2026-10-21". */
export function bucketTime(
  day: string,
  i: number,
  firstMin = SHADE_FIRST_MIN,
  bucketMin = SHADE_BUCKET_MIN,
) {
  const minutes = firstMin + i * bucketMin;
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return new Date(`${day}T${hh}:${mm}:00+08:00`);
}
