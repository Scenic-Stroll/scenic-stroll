/**
 * TEST HELPER: tiny hand-made walking graphs for the routing unit tests. Not used by the app.
 *
 * Nodes sit on a plain grid near Kowloon Tong, `x`/`y` in metres east/north of a corner, so edge
 * lengths are easy to reason about.
 */
import type { RoutingEdge, RoutingNode } from './graph-export.ts';
import { prepareGraph, type PreparedGraph } from './router.ts';
import type { LatLng } from './schemas.ts';
import type { ShadeMeta } from './shadows.ts';

// The corner sits inside GRAPH_BBOX so smart-route accepts these points.
const LNG0 = 114.17;
const LAT0 = 22.335;
export const at = (x: number, y: number): LatLng => ({
  lng: LNG0 + x / 102_950,
  lat: LAT0 + y / 110_574,
});

export type TestEdge = Partial<RoutingEdge> & { from: number; to: number };

export function testGraph(
  points: [number, number, number?][],
  edges: TestEdge[],
  options: { shadeMeta?: ShadeMeta } = {},
): PreparedGraph {
  const nodes: RoutingNode[] = points.map(([x, y, z = 10], id) => ({
    id,
    ...at(x, y),
    z,
    kind: 'street',
  }));
  return prepareGraph({
    buildId: 1,
    source: 'test',
    version: 'test',
    nodes,
    shadeMeta: options.shadeMeta ?? null,
    edges: edges.map(({ from, to, ...e }, id) => {
      const a = nodes[from]!;
      const b = nodes[to]!;
      const length = Math.hypot((b.lng - a.lng) * 102_950, (b.lat - a.lat) * 110_574);
      return {
        id,
        source: from,
        target: to,
        length_m: length,
        kind: 'footway',
        covered: false,
        indoor: false,
        air_conditioned: false,
        step_free: 'yes',
        slope_pct: 0,
        z_from: a.z,
        z_to: b.z,
        crossing_wait_s: 0,
        opening_hours: null,
        confidence: 0.9,
        bidirectional: true,
        name_en: null,
        name_zh: null,
        data_source: 'test',
        level_from: null,
        level_to: null,
        shade: null,
        line: [
          { lng: a.lng, lat: a.lat },
          { lng: b.lng, lat: b.lat },
        ],
        ...e,
      };
    }),
  });
}

/**
 * A choice of two ways from A (node 0) to B (node 3):
 *   north: 0 → 1 → 3, 200 m in the open
 *   south: 0 → 2 → 3, 260 m, covered (indoor Festival Walk, open 07:00–24:00) — or with options
 */
export function twoWayGraph(south: Partial<RoutingEdge> = {}) {
  return testGraph(
    [
      [0, 0],
      [100, 50],
      [100, -95],
      [200, 0],
    ],
    [
      { from: 0, to: 1, name_en: 'Tat Chee Avenue' },
      { from: 1, to: 3, name_en: 'Tat Chee Avenue' },
      {
        from: 0,
        to: 2,
        covered: true,
        indoor: true,
        air_conditioned: true,
        name_en: 'Festival Walk LG1',
        ...south,
      },
      {
        from: 2,
        to: 3,
        covered: true,
        indoor: true,
        air_conditioned: true,
        name_en: 'Festival Walk LG1',
        ...south,
      },
    ],
  );
}
