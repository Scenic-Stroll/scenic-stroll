import { describe, expect, it } from 'vitest';

import { haversineMeters, pathLengthMeters } from './geo.ts';
import {
  GPS_RULES,
  acceptSample,
  filterSamples,
  findGaps,
  simplify,
  trimEnds,
  type GpsSample,
} from './gps.ts';

// 0.00001° latitude ≈ 1.1 m. Helpers build a walk going north from Kowloon Tong Exit C1.
const START = { lat: 22.336961, lng: 114.175531 };
const T0 = 1_760_000_000_000;

/** A sample `metersNorth` of START, `seconds` after T0. */
function sample(metersNorth: number, seconds: number, accuracy: number | null = 5): GpsSample {
  return {
    lat: START.lat + metersNorth / 110_540,
    lng: START.lng,
    accuracy,
    timestamp: T0 + seconds * 1000,
  };
}

/** A straight walk: one sample every `every` seconds at `speed` m/s. */
function walk(count: number, speed = 1.4, every = 2.5): GpsSample[] {
  return Array.from({ length: count }, (_, i) => sample(i * speed * every, i * every));
}

describe('acceptSample', () => {
  it('accepts the first sample if accurate enough', () => {
    expect(acceptSample(null, sample(0, 0, 10))).toEqual({ ok: true });
  });

  it('rejects accuracy worse than 30 m', () => {
    expect(acceptSample(null, sample(0, 0, 31))).toEqual({ ok: false, reason: 'inaccurate' });
    expect(acceptSample(null, sample(0, 0, 30)).ok).toBe(true);
  });

  it('accepts unknown accuracy (some Android phones report none)', () => {
    expect(acceptSample(null, sample(0, 0, null)).ok).toBe(true);
  });

  it('accepts normal walking speed', () => {
    expect(acceptSample(sample(0, 0), sample(3.5, 2.5)).ok).toBe(true); // 1.4 m/s
  });

  it('rejects jumps faster than 3 m/s', () => {
    expect(acceptSample(sample(0, 0), sample(40, 2.5))).toEqual({ ok: false, reason: 'too_fast' });
  });

  it('rejects duplicate or out-of-order timestamps', () => {
    expect(acceptSample(sample(0, 5), sample(1, 5))).toEqual({ ok: false, reason: 'out_of_order' });
    expect(acceptSample(sample(0, 5), sample(1, 4))).toEqual({ ok: false, reason: 'out_of_order' });
  });
});

describe('filterSamples', () => {
  it('drops a single GPS jump and keeps the walk after it', () => {
    const samples = [
      sample(0, 0),
      sample(3.5, 2.5),
      sample(200, 5),
      sample(10.5, 7.5),
      sample(14, 10),
    ];
    const kept = filterSamples(samples);
    expect(kept.map((s) => s.timestamp)).toEqual([0, 2.5, 7.5, 10].map((s) => T0 + s * 1000));
  });

  it('drops inaccurate samples', () => {
    const kept = filterSamples([sample(0, 0), sample(3, 2.5, 80), sample(6, 5)]);
    expect(kept).toHaveLength(2);
  });

  it('accepts the first good fix after a long indoor gap (slow average speed)', () => {
    // 60 m in 60 s = 1 m/s → fine.
    const kept = filterSamples([sample(0, 0), sample(60, 60)]);
    expect(kept).toHaveLength(2);
  });
});

describe('findGaps', () => {
  it('finds no gaps in a continuous walk', () => {
    expect(findGaps(walk(20))).toEqual([]);
  });

  it('reports a gap longer than 20 s, with its size', () => {
    const samples = [sample(0, 0), sample(3, 2.5), sample(40, 47.5), sample(43, 50)];
    const gaps = findGaps(samples);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.fromIndex).toBe(1);
    expect(gaps[0]!.toIndex).toBe(2);
    expect(gaps[0]!.seconds).toBe(45);
    expect(gaps[0]!.meters).toBeCloseTo(37, 0);
  });

  it('does not count exactly 20 s as a gap', () => {
    expect(findGaps([sample(0, 0), sample(20, GPS_RULES.gapSeconds)])).toEqual([]);
  });
});

describe('trimEnds', () => {
  it('removes about 50 m from each end', () => {
    const points = walk(80); // 80 × 3.5 m ≈ 276 m
    const trimmed = trimEnds(points)!;
    expect(trimmed).not.toBeNull();
    expect(haversineMeters(points[0]!, trimmed[0]!)).toBeGreaterThanOrEqual(50);
    expect(haversineMeters(points.at(-1)!, trimmed.at(-1)!)).toBeGreaterThanOrEqual(50);
    expect(haversineMeters(points[0]!, trimmed[0]!)).toBeLessThan(54); // not much more than 50
  });

  it('returns null when the route is too short to trim', () => {
    expect(trimEnds(walk(20))).toBeNull(); // ≈ 66 m total
  });
});

describe('simplify', () => {
  it('reduces a straight line to its two ends', () => {
    const line = walk(50);
    const simple = simplify(line);
    expect(simple).toEqual([line[0], line.at(-1)]);
  });

  it('keeps a real corner', () => {
    // 50 m north, then 50 m east.
    const north = Array.from({ length: 11 }, (_, i) => ({
      lat: START.lat + (i * 5) / 110_540,
      lng: START.lng,
    }));
    const corner = north.at(-1)!;
    const east = Array.from({ length: 10 }, (_, i) => ({
      lat: corner.lat,
      lng: corner.lng + ((i + 1) * 5) / (111_320 * Math.cos((corner.lat * Math.PI) / 180)),
    }));
    const simple = simplify([...north, ...east]);
    expect(simple).toHaveLength(3);
    expect(simple[1]).toEqual(corner);
  });

  it('removes GPS jitter smaller than the tolerance but keeps the overall length', () => {
    const jittery = walk(60).map((p, i) => ({
      ...p,
      lng: p.lng + ((i % 2 ? 1 : -1) * 1) / 103_000,
    })); // ±1 m
    const simple = simplify(jittery);
    expect(simple.length).toBeLessThan(10);
    expect(pathLengthMeters(simple)).toBeCloseTo(pathLengthMeters(walk(60)), -1);
  });

  it('leaves 0, 1 or 2 points unchanged', () => {
    expect(simplify([])).toEqual([]);
    expect(simplify([START])).toEqual([START]);
  });

  it('handles 10 000 points without stack overflow', () => {
    expect(() => simplify(walk(10_000))).not.toThrow();
  });
});
