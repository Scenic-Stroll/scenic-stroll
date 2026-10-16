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
    const main = res.options.filter((o) => !o.roles.includes('alternative'));
    expect(main).toHaveLength(1);
    expect(main[0]!.roles).toEqual(['requested', 'best_now', 'fastest']);
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

describe('shade (step 4)', () => {
  // Two streets from A to B: north 200 m in full sun at noon, south 260 m in building shadow.
  // Shade values every 30 min from 07:00; index 10 = 12:00.
  const META = { date: '2026-10-16', firstMin: 420, bucketMin: 30 };
  const sunny = Array.from({ length: 25 }, () => 0);
  const shady = Array.from({ length: 25 }, () => 100);
  const shadeGraph = () =>
    testGraph(
      [
        [0, 0],
        [100, 50],
        [100, -95],
        [200, 0],
      ],
      [
        { from: 0, to: 1, shade: sunny },
        { from: 1, to: 3, shade: sunny },
        { from: 0, to: 2, shade: shady },
        { from: 2, to: 3, shade: shady },
      ],
      { shadeMeta: META },
    );
  const NOON_HK = new Date('2026-10-16T12:00:00+08:00');
  const NIGHT_HK = new Date('2026-10-16T21:00:00+08:00');

  it('at noon the shaded profile takes the shady street; fastest stays in the sun', () => {
    const res = planSmartRoutes(shadeGraph(), input({ profile: 'shaded', departure: NOON_HK }));
    const shaded = res.options.find((o) => o.profile === 'shaded')!;
    const fastest = res.options.find((o) => o.roles.includes('fastest'))!;
    expect(shaded.pct_shaded).toBeGreaterThan(90);
    expect(fastest.pct_shaded).toBeLessThan(10);
    expect(shaded.exposure.shade_m).toBeGreaterThan(250);
    expect(shaded.estimated).toContain('shade');
    expect(shaded.explanation.text).toContain('in shade or under cover at 12:00 (estimated)');
  });

  it('after dark shade does not matter: shaded = fastest, and no % shaded is claimed', () => {
    const res = planSmartRoutes(shadeGraph(), input({ profile: 'shaded', departure: NIGHT_HK }));
    // One main route (the other street may still be offered as the alternative).
    expect(res.options.filter((o) => !o.roles.includes('alternative'))).toHaveLength(1);
    expect(res.options.every((o) => o.pct_shaded === null)).toBe(true);
    expect(res.options[0]!.pct_shaded).toBeNull();
    expect(res.options[0]!.runs.every((r) => r.style === 'open')).toBe(true);
  });

  it('runs cover the whole line in order, and stairs get a marker', () => {
    const g = testGraph(
      [
        [0, 0],
        [100, 0],
        [101, 0, 13],
        [200, 0, 13],
      ],
      [
        { from: 0, to: 1, shade: sunny },
        { from: 1, to: 2, kind: 'stairs', step_free: 'no' },
        { from: 2, to: 3, indoor: true, covered: true, kind: 'indoor_corridor' },
      ],
      { shadeMeta: META },
    );
    const r = findRoute(g, {
      origin: at(0, 0),
      destination: at(200, 0),
      departure: NOON_HK,
      profile: 'fastest',
    })!;
    const s = summarizeRoute(r, at(0, 0), at(200, 0), {
      departure: NOON_HK,
      shadeMeta: META,
      sun: 1,
    });
    expect(s.runs.map((x) => x.style)).toEqual(['sun', 'stairs', 'indoor']);
    expect(s.runs[0]!.from).toBe(0);
    expect(s.runs.at(-1)!.to).toBe(s.coordinates.length - 1);
    s.runs.slice(1).forEach((run, i) => expect(run.from).toBe(s.runs[i]!.to));
    expect(s.markers.map((m) => m.kind)).toEqual(['stairs']);
  });
});

describe('alternatives (step 5)', () => {
  it('adds a genuinely different alternative when one exists within the detour cap', () => {
    // Open north street 200 m vs open south street 260 m: no cover anywhere, so every profile picks
    // the north street; the south one is offered as the alternative (1.3× the time).
    const g = testGraph(
      [
        [0, 0],
        [100, 50],
        [100, -95],
        [200, 0],
      ],
      [
        { from: 0, to: 1 },
        { from: 1, to: 3 },
        { from: 0, to: 2 },
        { from: 2, to: 3 },
      ],
    );
    const res = planSmartRoutes(g, input({ profile: 'fastest' }));
    expect(res.options.map((o) => [o.id, o.roles])).toEqual([
      ['fastest', ['requested', 'best_now', 'fastest']],
      ['fastest-alt', ['alternative']],
    ]);
  });

  it('offers no alternative when the only other way is far too long', () => {
    const g = testGraph(
      [
        [0, 0],
        [200, 0],
        [100, -400],
      ],
      [
        { from: 0, to: 1 },
        { from: 0, to: 2 },
        { from: 2, to: 1 },
      ],
    );
    const res = planSmartRoutes(g, input({ origin: at(0, 0), destination: at(200, 0) }));
    expect(res.options.some((o) => o.roles.includes('alternative'))).toBe(false);
  });

  it('honours the departure time: the same trip avoids a closed mall at night', () => {
    const g = twoWayGraph({ opening_hours: 'Mo-Su 07:00-24:00' });
    const day = planSmartRoutes(
      g,
      input({ profile: 'sheltered', departure: new Date('2026-10-16T12:00:00+08:00') }),
    );
    const night = planSmartRoutes(
      g,
      input({ profile: 'sheltered', departure: new Date('2026-10-17T02:00:00+08:00') }),
    );
    expect(day.options[0]!.pct_indoor).toBeGreaterThan(50);
    expect(night.options[0]!.pct_indoor).toBe(0);
  });
});
