import { describe, expect, it } from 'vitest';

import { cleanName, overlapRatio, stepFreeVerdict, summarizeRoute } from './route-summary.ts';
import { findRoute } from './router.ts';
import { at, testGraph, twoWayGraph } from './routing-test-graph.ts';
import { planSmartRoutes, type PlanInput } from './smart-route.ts';
import { SmartRouteResponseSchema } from './smart-route-api.ts';

const NOON = new Date('2026-10-16T12:00:00+08:00');
const input = (o: Partial<PlanInput> = {}): PlanInput => ({
  origin: at(-5, 0),
  destination: at(205, 0),
  profile: 'fastest',
  departure: NOON,
  condition: 'normal',
  conditionSource: 'given',
  ...o,
});

describe('cleanName', () => {
  it('drops generic suffixes and fixes SHOUTING and "Of"', () => {
    expect(cleanName('TAT CHEE AVENUE Subway')).toBe('Tat Chee Avenue');
    expect(cleanName('Tat Chee Avenue Crossing')).toBe('Tat Chee Avenue');
    expect(cleanName('City University Of Hong Kong Staircase')).toBe(
      'City University of Hong Kong',
    );
    expect(cleanName('Footway')).toBeNull();
    expect(cleanName(null)).toBeNull();
  });
});

describe('summarizeRoute', () => {
  it('measures cover, counts flights of stairs once, and writes directions', () => {
    const g = testGraph(
      [
        [0, 0],
        [100, 0],
        [101, 0, 13],
        [102, 0, 16],
        [200, 0, 16],
      ],
      [
        { from: 0, to: 1, name_en: 'Tat Chee Avenue' },
        { from: 1, to: 2, kind: 'stairs', step_free: 'no' },
        { from: 2, to: 3, kind: 'stairs', step_free: 'no' }, // same flight, drawn in two parts
        {
          from: 3,
          to: 4,
          kind: 'indoor_corridor',
          covered: true,
          indoor: true,
          name_en: 'Festival Walk LG1',
        },
      ],
    );
    const r = findRoute(g, {
      origin: at(0, 0),
      destination: at(200, 0),
      departure: NOON,
      profile: 'fastest',
    })!;
    const s = summarizeRoute(r, at(0, 0), at(200, 0));
    expect(s.stairs).toBe(1);
    expect(s.pct_covered).toBeGreaterThan(45);
    expect(s.pct_covered).toBeLessThan(55);
    expect(s.step_free).toBe('no');
    expect(s.segments).toEqual(['outdoor', 'stairs', 'indoor']);
    expect(s.steps.map((x) => x.instruction)).toEqual([
      'Walk along Tat Chee Avenue',
      'Take the stairs up', // one step, though the flight is drawn in two parts
      'Walk indoors through Festival Walk LG1',
      'Arrive at your destination',
    ]);
    expect(s.coordinates[0]).toEqual(at(0, 0));
    expect(s.coordinates.at(-1)).toEqual(at(200, 0));
  });
});

describe('stepFreeVerdict', () => {
  const g = twoWayGraph();
  const base = findRoute(g, {
    origin: at(-5, 0),
    destination: at(205, 0),
    departure: NOON,
    profile: 'fastest',
  })!;

  it('yes only when every part is known step-free', () => {
    expect(stepFreeVerdict(base)).toBe('yes');
  });
  it('unknown access anywhere → unconfirmed, never "yes"', () => {
    const legs = base.legs.map((l, i) =>
      i === 0 ? { ...l, edge: { ...l.edge, step_free: 'unknown' as const } } : l,
    );
    expect(stepFreeVerdict({ ...base, legs })).toBe('unconfirmed');
  });
  it('a long unmapped walk to the path → unconfirmed', () => {
    expect(stepFreeVerdict({ ...base, startAccess: { ...base.startAccess, distM: 90 } })).toBe(
      'unconfirmed',
    );
  });
});

describe('planSmartRoutes', () => {
  it('offers the requested profile, best-now for the weather and fastest, and the response is valid', () => {
    const res = planSmartRoutes(twoWayGraph(), input({ profile: 'sheltered', condition: 'rain' }));
    expect(res.status).toBe('ok');
    expect(res.best_profile).toBe('sheltered');
    expect(res.options.map((o) => [o.profile, o.roles])).toEqual([
      ['sheltered', ['requested', 'best_now']],
      ['fastest', ['fastest']],
    ]);
    // The sheltered option is more covered than the fastest one.
    expect(res.options[0]!.pct_covered).toBeGreaterThan(res.options[1]!.pct_covered);
    expect(res.options[0]!.estimated).toEqual(['air_conditioned']);
    expect(() => SmartRouteResponseSchema.parse(res)).not.toThrow();
  });

  it('merges identical routes instead of listing them twice', () => {
    const res = planSmartRoutes(twoWayGraph(), input({ profile: 'fastest', condition: 'night' }));
    expect(res.options).toHaveLength(1);
    expect(res.options[0]!.roles).toEqual(['requested', 'best_now', 'fastest']);
  });

  it('flags a preference route over 1.4× the fastest time as much longer', () => {
    // A covered detour of ~540 m vs 200 m in the open: sheltered takes it, but it is 2.7× as long.
    const g = testGraph(
      [
        [0, 0],
        [200, 0],
        [100, -250],
      ],
      [
        { from: 0, to: 1 },
        { from: 0, to: 2, covered: true, indoor: true },
        { from: 2, to: 1, covered: true, indoor: true },
      ],
    );
    const res = planSmartRoutes(
      g,
      input({ origin: at(0, 0), destination: at(200, 0), profile: 'sheltered' }),
    );
    const sheltered = res.options.find((o) => o.profile === 'sheltered')!;
    expect(sheltered.much_longer).toBe(true);
    expect(sheltered.extra_s_vs_fastest).toBeGreaterThan(0);
  });

  it('reports a profile with no route as unavailable', () => {
    const g = testGraph(
      [
        [0, 0],
        [100, 0],
      ],
      [{ from: 0, to: 1, kind: 'stairs', step_free: 'no' }],
    );
    const res = planSmartRoutes(
      g,
      input({ origin: at(0, 0), destination: at(100, 0), profile: 'step_free' }),
    );
    expect(res.status).toBe('ok');
    expect(res.unavailable).toEqual(['step_free']);
    expect(res.options.map((o) => o.profile)).toEqual(['balanced']);
  });

  it('says outside_area / no_graph so the app falls back to the standard route', () => {
    expect(
      planSmartRoutes(twoWayGraph(), input({ origin: { lat: 22.28, lng: 114.16 } })).status,
    ).toBe('outside_area');
    expect(planSmartRoutes(null, input()).status).toBe('no_graph');
  });

  it('overlapRatio: a route fully inside another is 1, disjoint routes 0', () => {
    const g = twoWayGraph();
    const q = { origin: at(-5, 0), destination: at(205, 0), departure: NOON };
    const north = findRoute(g, { ...q, profile: 'fastest' })!;
    const south = findRoute(g, { ...q, profile: 'sheltered' })!;
    expect(overlapRatio(north, north)).toBe(1);
    expect(overlapRatio(north, south)).toBe(0);
  });
});
