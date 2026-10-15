import { describe, expect, it } from 'vitest';

import { findRoute, nearbyNodes, prepareGraph } from './router.ts';
import { edgeCost, edgeTimeS, LIFT_WAIT_S, PROFILE_FOR_CONDITION } from './routing-profiles.ts';
import { at, testGraph, twoWayGraph } from './routing-test-graph.ts';

const NOON = new Date('2026-10-16T12:00:00+08:00');
const TWO_AM = new Date('2026-10-17T02:00:00+08:00');
const A = at(-5, 0); // just west of node 0
const B = at(205, 0); // just east of node 3

/** Which way a route went: 'north' (open street) or 'south' (covered). */
const way = (r: ReturnType<typeof findRoute>) =>
  r?.legs.some((l) => l.edge.indoor) ? 'south' : 'north';

describe('edgeTimeS', () => {
  const g = testGraph(
    [
      [0, 0, 10],
      [1, 0, 17],
      [30, 0, 10],
    ],
    [
      { from: 0, to: 1, kind: 'lift' },
      { from: 0, to: 1, kind: 'stairs' },
      { from: 0, to: 1, kind: 'escalator' },
      { from: 0, to: 2, kind: 'crossing', crossing_wait_s: 45 },
      { from: 0, to: 2, slope_pct: 12 },
    ],
  );
  const [lift, stairs, escalator, crossing, steep] = g.edges;

  it('lift = wait + 10 s per floor (7 m ≈ 2 floors)', () => {
    expect(edgeTimeS(lift!)).toBe(LIFT_WAIT_S + 20);
  });
  it('stairs and escalators use the climb, not just the map length', () => {
    expect(edgeTimeS(stairs!)).toBeCloseTo(Math.hypot(1, 7) / 0.9, 1);
    expect(edgeTimeS(escalator!)).toBeCloseTo(Math.hypot(1, 7) / 0.6, 1);
  });
  it('crossings add the wait; steep slopes are walked slower', () => {
    expect(edgeTimeS(crossing!)).toBeCloseTo(30 / 1.3 + 45, 1);
    expect(edgeTimeS(steep!)).toBeCloseTo(30 / 0.9, 1);
  });
});

describe('edgeCost', () => {
  const g = twoWayGraph();
  const open = g.edges[0]!;
  const covered = g.edges[2]!;

  it('sheltered makes open-air walking cost 4×, covered walking unchanged', () => {
    expect(edgeCost(open, 'sheltered')! / edgeTimeS(open)).toBeCloseTo(4);
    expect(edgeCost(covered, 'sheltered')! / edgeTimeS(covered)).toBeLessThan(1); // + a little for AC
  });
  it('fastest is just time', () => {
    expect(edgeCost(open, 'fastest')).toBe(edgeTimeS(open));
  });
  it('step-free can never use stairs, and pays ×3 for unknown access', () => {
    expect(edgeCost({ ...open, step_free: 'no' }, 'step_free')).toBeNull();
    expect(edgeCost({ ...open, step_free: 'unknown' }, 'step_free')).toBeCloseTo(
      edgeTimeS(open) * 3,
    );
  });
  it('air-conditioning never makes an edge free', () => {
    expect(edgeCost(covered, 'cool')! / edgeTimeS(covered)).toBeGreaterThanOrEqual(0.3);
  });
  it('rain → sheltered, heat → cool', () => {
    expect(PROFILE_FOR_CONDITION.rain).toBe('sheltered');
    expect(PROFILE_FOR_CONDITION.heat).toBe('cool');
  });
});

describe('findRoute', () => {
  it('fastest takes the short open street; sheltered takes the covered way', () => {
    const g = twoWayGraph();
    const q = { origin: A, destination: B, departure: NOON };
    expect(way(findRoute(g, { ...q, profile: 'fastest' }))).toBe('north');
    expect(way(findRoute(g, { ...q, profile: 'sheltered' }))).toBe('south');
  });

  it('never goes through an indoor link while it is closed', () => {
    const g = twoWayGraph({ opening_hours: 'Mo-Su 07:00-24:00' });
    const q = { origin: A, destination: B, profile: 'sheltered' as const };
    expect(way(findRoute(g, { ...q, departure: NOON }))).toBe('south');
    expect(way(findRoute(g, { ...q, departure: TWO_AM }))).toBe('north');
  });

  it('step-free avoids stairs even when that is much longer', () => {
    const g = twoWayGraph({ kind: 'stairs', step_free: 'no' });
    // make the stairs way the short one
    const route = findRoute(g, {
      origin: A,
      destination: B,
      departure: NOON,
      profile: 'step_free',
    });
    expect(route?.legs.every((l) => l.edge.step_free !== 'no')).toBe(true);
  });

  it('returns null when step-free is impossible', () => {
    const g = testGraph(
      [
        [0, 0],
        [100, 0],
      ],
      [{ from: 0, to: 1, kind: 'stairs', step_free: 'no' }],
    );
    expect(
      findRoute(g, {
        origin: at(0, 0),
        destination: at(100, 0),
        departure: NOON,
        profile: 'step_free',
      }),
    ).toBeNull();
  });

  it('walks one-way escalators only the allowed way', () => {
    // 0 → 1 escalator up (one way) is a shortcut; the way back must use the long path.
    const g = testGraph(
      [
        [0, 0],
        [50, 0],
        [25, 120],
      ],
      [
        { from: 0, to: 1, kind: 'escalator', bidirectional: false, step_free: 'no' },
        { from: 1, to: 2 },
        { from: 2, to: 0 },
      ],
    );
    const up = findRoute(g, {
      origin: at(0, 0),
      destination: at(50, 0),
      departure: NOON,
      profile: 'fastest',
    });
    const down = findRoute(g, {
      origin: at(50, 0),
      destination: at(0, 0),
      departure: NOON,
      profile: 'fastest',
    });
    expect(up?.legs.map((l) => l.edge.kind)).toEqual(['escalator']);
    expect(down?.legs.some((l) => l.edge.kind === 'escalator')).toBe(false);
  });

  it('starts from a reachable node even if the nearest node is behind stairs', () => {
    // Destination point is 10 m from node 1 (only reachable by stairs) and 40 m from node 2 (ramp).
    const g = testGraph(
      [
        [0, 0],
        [100, 10],
        [100, -40],
      ],
      [
        { from: 0, to: 1, kind: 'stairs', step_free: 'no' },
        { from: 0, to: 2, kind: 'ramp' },
      ],
    );
    const r = findRoute(g, {
      origin: at(0, 0),
      destination: at(100, 0),
      departure: NOON,
      profile: 'step_free',
    });
    expect(r?.endAccess.node.id).toBe(2);
  });

  it('returns null for points far from the graph', () => {
    const g = twoWayGraph();
    expect(
      findRoute(g, { origin: at(-2000, 0), destination: B, departure: NOON, profile: 'fastest' }),
    ).toBeNull();
  });

  it('nearbyNodes sorts by distance and respects the radius', () => {
    const g = twoWayGraph();
    const near = nearbyNodes(g, at(0, 0), 150, 5);
    expect(near.map((n) => n.node.id)).toEqual([0, 1, 2]);
  });
});

describe('prepareGraph', () => {
  it('copes with node ids that have gaps (the database keeps the build script ids)', () => {
    const g = twoWayGraph();
    // Shift every id by 1000 and skip some numbers, like the uploaded main piece.
    const gapped = prepareGraph({
      ...g,
      nodes: g.nodes.map((n) => ({ ...n, id: n.id * 7 + 1000 })),
      edges: g.edges.map((e) => ({
        ...e,
        source: e.source * 7 + 1000,
        target: e.target * 7 + 1000,
      })),
    });
    const r = findRoute(gapped, {
      origin: at(-5, 0),
      destination: at(205, 0),
      departure: NOON,
      profile: 'fastest',
    });
    expect(r?.legs).toHaveLength(2);
  });
});
