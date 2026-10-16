import { describe, expect, it } from 'vitest';

import {
  bucketTime,
  circlePolygon,
  convexHull,
  lineShadeFraction,
  makeProjection,
  MAX_SHADOW_M,
  pointInPolygon,
  shadeBucket,
  ShadeIndex,
  shadowPolygon,
  SHADE_BUCKET_MIN,
  SHADE_FIRST_MIN,
} from './shadows.ts';

/** A 10 × 10 m building with its corner at the origin. */
const BOX = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

describe('shadowPolygon', () => {
  it('a 30 m building with the sun due south at 45° casts a 30 m shadow to the north', () => {
    const shadow = shadowPolygon(BOX, 30, { altitude_deg: 45, azimuth_deg: 180 })!;
    const maxY = Math.max(...shadow.map((p) => p.y));
    expect(maxY).toBeCloseTo(40, 6); // 10 m building depth + 30 m shadow
    expect(Math.min(...shadow.map((p) => p.y))).toBeCloseTo(0, 6);
    expect(pointInPolygon({ x: 5, y: 35 }, shadow)).toBe(true);
    expect(pointInPolygon({ x: 5, y: 45 }, shadow)).toBe(false);
  });

  it('a low sun (30°) makes the shadow longer: 30 / tan(30°) ≈ 52 m', () => {
    const shadow = shadowPolygon(BOX, 30, { altitude_deg: 30, azimuth_deg: 180 })!;
    expect(Math.max(...shadow.map((p) => p.y)) - 10).toBeCloseTo(30 / Math.tan(Math.PI / 6), 6);
  });

  it('morning sun in the east casts the shadow west', () => {
    const shadow = shadowPolygon(BOX, 20, { altitude_deg: 45, azimuth_deg: 90 })!;
    expect(Math.min(...shadow.map((p) => p.x))).toBeCloseTo(-20, 6);
  });

  it('caps very long shadows and casts none at night', () => {
    const shadow = shadowPolygon(BOX, 100, { altitude_deg: 1, azimuth_deg: 180 })!;
    expect(Math.max(...shadow.map((p) => p.y)) - 10).toBeCloseTo(MAX_SHADOW_M, 6);
    expect(shadowPolygon(BOX, 30, { altitude_deg: -5, azimuth_deg: 180 })).toBeNull();
  });

  it('height 0 (a canopy) shades just its footprint', () => {
    const shadow = shadowPolygon(BOX, 0, { altitude_deg: 60, azimuth_deg: 180 })!;
    expect(pointInPolygon({ x: 5, y: 5 }, shadow)).toBe(true);
    expect(pointInPolygon({ x: 5, y: 11 }, shadow)).toBe(false);
  });
});

describe('geometry helpers', () => {
  it('convexHull drops inner points', () => {
    expect(convexHull([...BOX, { x: 5, y: 5 }])).toHaveLength(4);
  });

  it('makeProjection round-trips and measures metres', () => {
    const proj = makeProjection({ lat: 22.3365, lng: 114.1735 });
    const p = { lat: 22.3375, lng: 114.1745 };
    const xy = proj.toXY(p);
    expect(xy.y).toBeCloseTo(110.574, 2);
    const back = proj.toLatLng(xy);
    expect(back.lat).toBeCloseTo(p.lat, 9);
    expect(back.lng).toBeCloseTo(p.lng, 9);
  });

  it('lineShadeFraction measures the shaded share of a path', () => {
    // A path along x = 5 from y = -40 to y = 40. The box + its 30 m shadow cover y = 0…40: half.
    const index = new ShadeIndex([shadowPolygon(BOX, 30, { altitude_deg: 45, azimuth_deg: 180 })!]);
    const line = [
      { x: 5, y: -40 },
      { x: 5, y: 40 },
    ];
    const f = lineShadeFraction(line, [index], 1);
    expect(f).toBeGreaterThan(0.45);
    expect(f).toBeLessThan(0.55);
  });

  it('trees: a point under a crown is shaded', () => {
    const index = new ShadeIndex([circlePolygon({ x: 0, y: 0 }, 4)]);
    expect(index.covers({ x: 1, y: 1 })).toBe(true);
    expect(index.covers({ x: 6, y: 0 })).toBe(false);
  });
});

describe('shade time buckets', () => {
  const meta = { firstMin: SHADE_FIRST_MIN, bucketMin: SHADE_BUCKET_MIN };
  it('maps Hong Kong times to the nearest 30-minute bucket from 07:00', () => {
    expect(shadeBucket(new Date('2026-10-16T07:00:00+08:00'), meta)).toBe(0);
    expect(shadeBucket(new Date('2026-10-16T13:10:00+08:00'), meta)).toBe(12); // 13:00
    expect(shadeBucket(new Date('2026-10-16T13:20:00+08:00'), meta)).toBe(13); // 13:30
    expect(shadeBucket(new Date('2026-10-16T19:00:00+08:00'), meta)).toBe(24);
    expect(shadeBucket(new Date('2026-10-16T21:00:00+08:00'), meta)).toBeNull();
  });
  it('bucketTime is the inverse', () => {
    expect(bucketTime('2026-10-21', 12).toISOString()).toBe('2026-10-21T05:00:00.000Z');
  });
});
