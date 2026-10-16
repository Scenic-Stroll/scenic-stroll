import { describe, expect, it } from 'vitest';

import {
  decodePolyline,
  haversineMeters,
  pathLengthMeters,
  pointFromEwkbHex,
  pointFromPostgis,
} from './geo.ts';

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

  it('decodes precision 6 (our walking graph export)', () => {
    // Same line as the Google example, encoded at precision 6 by PostGIS: first point 38.5, -120.2.
    const [first] = decodePolyline('_izlhA~rlgdF', 6);
    expect(first).toEqual({ lat: 38.5, lng: -120.2 });
  });
});

describe('pointFromEwkbHex', () => {
  it('reads the point Realtime sends for a geometry column', () => {
    // From Postgres: st_setsrid(st_makepoint(114.1735, 22.3365), 4326)::text
    const p = pointFromEwkbHex('0101000020E6100000C976BE9F1A8B5C40A01A2FDD24563640');
    expect(p?.lng).toBeCloseTo(114.1735, 9);
    expect(p?.lat).toBeCloseTo(22.3365, 9);
  });
  it('null for junk or non-points', () => {
    expect(pointFromEwkbHex('hello')).toBeNull();
    expect(pointFromEwkbHex('0102000020E6100000C976BE9F1A8B5C40A01A2FDD24563640')).toBeNull();
  });
});

describe('pointFromPostgis', () => {
  it('reads the GeoJSON Realtime sends (seen live), and EWKB strings', () => {
    const fromRealtime = {
      crs: { type: 'name', properties: { name: 'EPSG:4326' } },
      type: 'Point',
      coordinates: [114.175637370941, 22.33679095585018],
    };
    expect(pointFromPostgis(fromRealtime)).toEqual({
      lng: 114.175637370941,
      lat: 22.33679095585018,
    });
    expect(pointFromPostgis('0101000020E6100000C976BE9F1A8B5C40A01A2FDD24563640')?.lat).toBeCloseTo(
      22.3365,
    );
  });
  it('null for anything else', () => {
    expect(pointFromPostgis(null)).toBeNull();
    expect(pointFromPostgis({ type: 'LineString', coordinates: [[1, 2]] })).toBeNull();
  });
});
