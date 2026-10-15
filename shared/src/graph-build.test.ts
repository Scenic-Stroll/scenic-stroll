import { describe, expect, it } from 'vitest';

import {
  buildTopology,
  componentSizes,
  edgeAttributesFrom3dpn,
  isUsableSegment,
  markMtrExits,
  openingHoursFrom3dpn,
  type Dpn3Attributes,
  type SegmentInput,
} from './graph-build.ts';

const attrs = (o: Partial<Dpn3Attributes> = {}): Dpn3Attributes => ({
  PedestrianRouteID: 1,
  Location: 1,
  FeatureType: 1,
  AliasNameEN: null,
  AliasNameTC: null,
  StreetNameEN: 'Tat Chee Avenue',
  StreetNameTC: '達之路',
  WeatherProof: 2,
  WheelchairBarrier: 2,
  Gradient: 0.02,
  Direction: 0,
  PositionCertainty: 1,
  Enabled: 1,
  DataSource: 1,
  FloorID: null,
  AccessTimeID: null,
  ...o,
});

describe('edgeAttributesFrom3dpn', () => {
  it('a plain outdoor footway', () => {
    const a = edgeAttributesFrom3dpn(attrs(), null);
    expect(a).toMatchObject({
      kind: 'footway',
      covered: false,
      indoor: false,
      air_conditioned: false,
      step_free: 'yes',
      slope_pct: 2,
      bidirectional: true,
      name_en: 'Tat Chee Avenue',
      name_zh: '達之路',
    });
  });

  it('indoor walkways are covered and (estimated) air-conditioned', () => {
    expect(edgeAttributesFrom3dpn(attrs({ Location: 2 }), null)).toMatchObject({
      kind: 'indoor_corridor',
      covered: true,
      indoor: true,
      air_conditioned: true,
    });
  });

  it('covered outdoor walkways and subways count as covered', () => {
    expect(edgeAttributesFrom3dpn(attrs({ WeatherProof: 1 }), null).covered).toBe(true);
    expect(edgeAttributesFrom3dpn(attrs({ FeatureType: 4 }), null)).toMatchObject({
      kind: 'subway',
      covered: true,
    });
  });

  it('step-free is conservative: stairs, escalators and marked barriers are "no"', () => {
    expect(edgeAttributesFrom3dpn(attrs({ FeatureType: 12 }), null).step_free).toBe('no');
    expect(edgeAttributesFrom3dpn(attrs({ FeatureType: 8 }), null).step_free).toBe('no');
    expect(edgeAttributesFrom3dpn(attrs({ WheelchairBarrier: 1 }), null).step_free).toBe('no');
    expect(edgeAttributesFrom3dpn(attrs({ FeatureType: 13 }), null).step_free).toBe('unknown'); // stairlift
    expect(edgeAttributesFrom3dpn(attrs({ FeatureType: 10 }), null)).toMatchObject({
      kind: 'lift',
      step_free: 'yes',
    });
    expect(edgeAttributesFrom3dpn(attrs({ FeatureType: 11 }), null).step_free).toBe('yes'); // ramp
  });

  it('crossings get an estimated wait; one-way escalators are not bidirectional', () => {
    expect(edgeAttributesFrom3dpn(attrs({ FeatureType: 30 }), null)).toMatchObject({
      kind: 'crossing',
      crossing_wait_s: 45,
    });
    expect(edgeAttributesFrom3dpn(attrs({ FeatureType: 31 }), null).crossing_wait_s).toBe(5);
    expect(
      edgeAttributesFrom3dpn(attrs({ FeatureType: 8, Direction: 1 }), null).bidirectional,
    ).toBe(false);
  });

  it('trusts field-checked data more and uncertain positions less', () => {
    expect(edgeAttributesFrom3dpn(attrs({ DataSource: 10 }), null).confidence).toBe(0.9);
    expect(edgeAttributesFrom3dpn(attrs({ PositionCertainty: 0 }), null).confidence).toBeCloseTo(
      0.6,
    );
  });
});

describe('isUsableSegment', () => {
  it('skips disabled segments, proposals and MTR paid areas', () => {
    expect(isUsableSegment(attrs())).toBe(true);
    expect(isUsableSegment(attrs({ Enabled: 2 }))).toBe(false);
    expect(isUsableSegment(attrs({ DataSource: 9 }))).toBe(false);
    expect(isUsableSegment(attrs({ Location: 3 }))).toBe(false);
  });
});

describe('openingHoursFrom3dpn', () => {
  it('turns OPEN rows into OSM-style hours', () => {
    expect(openingHoursFrom3dpn('OPEN', [{ DayCode: 'ED', FromTime: 700, ToTime: 2359 }])).toBe(
      'Mo-Su 07:00-24:00',
    );
    expect(
      openingHoursFrom3dpn('OPEN', [
        { DayCode: 'WD', FromTime: 800, ToTime: 1930 },
        { DayCode: 'SAT', FromTime: 800, ToTime: 1300 },
      ]),
    ).toBe('Mo-Fr 08:00-19:30; Sa 08:00-13:00');
  });

  it('open around the clock is the same as no hours', () => {
    expect(openingHoursFrom3dpn('OPEN', [{ DayCode: 'ED', FromTime: 0, ToTime: 2359 }])).toBeNull();
  });

  it('CLOSE rows (e.g. lift maintenance) become "off" times', () => {
    expect(openingHoursFrom3dpn('CLOSE', [{ DayCode: 'WED', FromTime: 900, ToTime: 1100 }])).toBe(
      'Mo-Su 00:00-24:00; We 09:00-11:00 off',
    );
  });
});

// ---- topology ------------------------------------------------------------------------------

/** About 1 m in degrees near Kowloon Tong. */
const M_LNG = 1 / 102_950;
const M_LAT = 1 / 110_574;
const LNG0 = 114.17;
const LAT0 = 22.335;
/** A point `x` m east and `y` m north of the origin, at height z. */
const pt = (x: number, y: number, z = 10): [number, number, number] => [
  LNG0 + x * M_LNG,
  LAT0 + y * M_LAT,
  z,
];

const seg = (
  coords: [number, number, number][],
  o: Partial<Dpn3Attributes> = {},
  reversed = false,
): SegmentInput => ({
  attrs: edgeAttributesFrom3dpn(attrs(o), null),
  coords,
  levelName: null,
  sourceRef: 'x',
  reversed,
});

describe('buildTopology', () => {
  it('joins segments that end at the same point', () => {
    const { nodes, edges } = buildTopology([
      seg([pt(0, 0), pt(50, 0)]),
      seg([pt(50, 0), pt(100, 0)]),
    ]);
    expect(nodes).toHaveLength(3);
    expect(edges[0]!.target).toBe(edges[1]!.source);
    expect(edges[0]!.length_m).toBeGreaterThan(49);
    expect(edges[0]!.length_m).toBeLessThan(51);
  });

  it('does NOT join a footbridge to the street it crosses (different height)', () => {
    const street = seg([pt(0, 0, 10), pt(100, 0, 10)]);
    // The bridge ends right above the street's end, 6 m higher.
    const bridge = seg([pt(100, 0.5, 16), pt(100, 60, 16)], { FeatureType: 2 });
    const { nodes } = buildTopology([street, bridge]);
    expect(nodes).toHaveLength(4);
    expect(componentSizes(nodes)).toEqual([2, 2]);
  });

  it('joins a loose end within 1.5 m at the same height (small drawing gaps)', () => {
    const { nodes } = buildTopology([seg([pt(0, 0), pt(50, 0)]), seg([pt(51, 0), pt(100, 0)])]);
    expect(nodes).toHaveLength(3);
    expect(componentSizes(nodes)).toEqual([3]);
  });

  it('keeps a short staircase (a few steps) instead of collapsing it into one point', () => {
    const before = seg([pt(-20, 0, 10), pt(0, 0, 10)]);
    const steps = seg([pt(0, 0, 10), pt(1, 0, 10.8)], { FeatureType: 12 });
    const after = seg([pt(1, 0, 10.8), pt(20, 0, 10.8)]);
    const { edges, nodes } = buildTopology([before, steps, after]);
    expect(edges.map((e) => e.kind)).toEqual(['footway', 'stairs', 'footway']);
    expect(nodes.filter((n) => n.kind === 'stairs_top')).toHaveLength(1);
    expect(nodes.filter((n) => n.kind === 'stairs_bottom')).toHaveLength(1);
  });

  it('points one-way edges the allowed way', () => {
    const { edges, nodes } = buildTopology([
      seg([pt(0, 0), pt(10, 0)], { FeatureType: 8, Direction: -1 }, true),
    ]);
    const e = edges[0]!;
    expect(e.bidirectional).toBe(false);
    expect(nodes[e.source]!.lng).toBeGreaterThan(nodes[e.target]!.lng); // drawn west→east, allowed east→west
  });

  it('marks doors where indoor meets outdoor, and numbers components biggest first', () => {
    const { nodes } = buildTopology([
      seg([pt(0, 0), pt(10, 0)]),
      seg([pt(10, 0), pt(20, 0)], { Location: 2 }),
      seg([pt(500, 0), pt(510, 0)]), // a separate scrap
    ]);
    expect(nodes.find((n) => n.is_entrance)?.kind).toBe('building_entrance');
    expect(componentSizes(nodes)).toEqual([3, 2]);
  });
});

describe('markMtrExits', () => {
  it('marks the nearest main-network node and reports exits with none nearby', () => {
    const { nodes } = buildTopology([seg([pt(0, 0), pt(50, 0)])]);
    const missing = markMtrExits(nodes, [
      { id: 'near', lng: pt(3, 2)[0], lat: pt(3, 2)[1] },
      { id: 'far', lng: pt(300, 0)[0], lat: pt(300, 0)[1] },
    ]);
    expect(missing).toEqual(['far']);
    expect(nodes.filter((n) => n.kind === 'mrt_exit')).toHaveLength(1);
  });
});
