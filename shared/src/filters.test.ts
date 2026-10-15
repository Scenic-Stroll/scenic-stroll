import { describe, expect, it } from 'vitest';

import { parseCommunityRoutes } from './community-route.ts';
import { FILTERS, matchesFilters, type FilterKey } from './filters.ts';
import { isTag } from './taxonomy.ts';

describe('FILTERS', () => {
  it('only uses tags from the taxonomy', () => {
    for (const f of FILTERS) for (const tag of f.tags) expect(isTag(tag)).toBe(true);
  });

  it('every filter except "verified" maps to at least one tag', () => {
    for (const f of FILTERS.filter((f) => f.key !== 'verified'))
      expect(f.tags.length).toBeGreaterThan(0);
  });
});

describe('matchesFilters', () => {
  const route = { tags: ['indoor', 'lift'], status: 'unverified' };
  const sel = (...keys: FilterKey[]) => new Set(keys);

  it('no filters → everything matches', () => {
    expect(matchesFilters(route, sel())).toBe(true);
  });

  it('a filter matches if ANY of its tags is present (indoor counts as sheltered)', () => {
    expect(matchesFilters(route, sel('sheltered'))).toBe(true);
  });

  it('all selected filters must match', () => {
    expect(matchesFilters(route, sel('sheltered', 'lifts'))).toBe(true);
    expect(matchesFilters(route, sel('sheltered', 'shaded'))).toBe(false);
  });

  it('step-free requires the step_free tag — a lift alone is not enough', () => {
    expect(matchesFilters(route, sel('step_free'))).toBe(false);
  });

  it('"verified only" checks the status', () => {
    expect(matchesFilters(route, sel('verified'))).toBe(false);
    expect(matchesFilters({ ...route, status: 'verified' }, sel('verified'))).toBe(true);
  });
});

describe('parseCommunityRoutes', () => {
  const row = {
    id: 'r1',
    title: 'Exit A1 → MMW',
    start_label: 'Kowloon Tong Exit A1',
    end_label: null,
    distance_m: 383,
    duration_s: 300,
    status: 'unverified',
    last_confirmed_at: null,
    created_at: '2026-10-16T08:00:00Z',
    geojson: {
      type: 'LineString',
      coordinates: [
        [114.177764, 22.336895],
        [114.174147, 22.336116],
      ],
    },
    author_name: null,
  };

  it('converts GeoJSON [lng, lat] to {lat, lng}', () => {
    const { routes } = parseCommunityRoutes([row]);
    expect(routes[0]!.line[0]).toEqual({ lat: 22.336895, lng: 114.177764 });
  });

  it('skips malformed rows instead of failing everything', () => {
    const { routes, skipped } = parseCommunityRoutes([row, { ...row, id: 'bad', geojson: null }]);
    expect(routes.map((r) => r.id)).toEqual(['r1']);
    expect(skipped).toBe(1);
  });

  it('handles a non-array response', () => {
    expect(parseCommunityRoutes(null)).toEqual({ routes: [], skipped: 0 });
  });
});
