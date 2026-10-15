import { describe, expect, it } from 'vitest';

import { decodePolyline, haversineMeters, pathLengthMeters } from './geo.ts';

describe('haversineMeters', () => {
  it('is zero for the same point', () => {
    expect(haversineMeters({ lat: 22.3365, lng: 114.1735 }, { lat: 22.3365, lng: 114.1735 })).toBe(
      0,
    );
  });

  it('matches a known distance: 0.001° latitude ≈ 111 m', () => {
    const d = haversineMeters({ lat: 22.3365, lng: 114.1735 }, { lat: 22.3375, lng: 114.1735 });
    expect(d).toBeGreaterThan(110.5);
    expect(d).toBeLessThan(111.5);
  });

  it('accounts for longitude shrinking with latitude (HK ≈ 22.3°N)', () => {
    // 0.001° longitude at 22.3365°N ≈ 111.32 km * cos(22.3365°) / 1000 ≈ 102.9 m
    const d = haversineMeters({ lat: 22.3365, lng: 114.1735 }, { lat: 22.3365, lng: 114.1745 });
    expect(d).toBeGreaterThan(102.4);
    expect(d).toBeLessThan(103.4);
  });
});

describe('pathLengthMeters', () => {
  it('sums the segments', () => {
    const a = { lat: 22.3365, lng: 114.1735 };
    const b = { lat: 22.3375, lng: 114.1735 };
    const c = { lat: 22.3385, lng: 114.1735 };
    expect(pathLengthMeters([a, b, c])).toBeCloseTo(2 * haversineMeters(a, b), 6);
  });

  it('is zero for fewer than two points', () => {
    expect(pathLengthMeters([])).toBe(0);
    expect(pathLengthMeters([{ lat: 22.3, lng: 114.1 }])).toBe(0);
  });
});

describe('decodePolyline', () => {
  it('decodes the reference example from the Google polyline spec', () => {
    // https://developers.google.com/maps/documentation/utilities/polylinealgorithm
    const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(points).toHaveLength(3);
    expect(points[0]).toEqual({ lat: 38.5, lng: -120.2 });
    expect(points[1]).toEqual({ lat: 40.7, lng: -120.95 });
    expect(points[2]).toEqual({ lat: 43.252, lng: -126.453 });
  });

  it('returns an empty list for an empty string', () => {
    expect(decodePolyline('')).toEqual([]);
  });
});
