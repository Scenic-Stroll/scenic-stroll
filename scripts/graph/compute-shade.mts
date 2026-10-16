// Computes how shaded every walking-graph edge is, every 30 min from 07:00 to 19:00, on one day:
// building shadows (Lands Department heights + the sun's position) and tree crowns (OpenStreetMap).
// Saves scripts/graph/data/shade.json for npm run graph:load-shade.
// Run: npm run graph:shade               (today, Hong Kong time)
//      npm run graph:shade -- 2026-10-24  (a given day, e.g. the pitch)
//
// One day's shade is reused for about two weeks: in October the sun's path moves < 0.4° per day.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { GraphEdge, GraphNode } from '../../shared/src/graph-build.ts';
import { DEMO_CENTER } from '../../shared/src/presets.ts';
import {
  bucketTime,
  circlePolygon,
  lineShadeFraction,
  makeProjection,
  SHADE_BUCKET_MIN,
  SHADE_BUCKETS,
  SHADE_FIRST_MIN,
  ShadeIndex,
  shadowPolygon,
  type XY,
} from '../../shared/src/shadows.ts';
import { sunPosition } from '../../shared/src/sun.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (name: string) => JSON.parse(fs.readFileSync(path.join(here, 'data', name), 'utf8'));
const graph = read('graph.json') as { nodes: GraphNode[]; edges: GraphEdge[] };
const buildingData = read('buildings.json') as {
  buildings: {
    attributes: { BaseHeight: number | null; TopHeight: number | null; BuildingBlockType: string };
    geometry?: { rings: [number, number][][] };
  }[];
};
const treeData = read('trees.json') as {
  elements: {
    type: string;
    tags?: { natural?: string };
    lat?: number;
    lon?: number;
    geometry?: { lat: number; lon: number }[];
  }[];
};

const day =
  process.argv[2] ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Hong_Kong' });
if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Date must look like 2026-10-24, got ${day}`);
const started = Date.now();
const proj = makeProjection(DEMO_CENTER);

// ---- ground level near each building ------------------------------------------------------
// TopHeight is metres above sea level (mPD). A shadow on the street comes from the roof's height
// above the STREET, so we find the nearest street-level graph node (3DPN heights are mPD too).
const main = graph.nodes.filter((n) => n.component === 0);
const outdoorIds = new Set(
  graph.edges.filter((e) => !e.indoor).flatMap((e) => [e.source, e.target]),
);
const streetNodes = main
  .filter((n) => outdoorIds.has(n.id))
  .map((n) => ({ ...proj.toXY(n), z: n.z }));
const grid = new Map<string, typeof streetNodes>();
const key = (x: number, y: number) => `${Math.floor(x / 50)},${Math.floor(y / 50)}`;
for (const n of streetNodes) {
  const k = key(n.x, n.y);
  grid.set(k, [...(grid.get(k) ?? []), n]);
}
function groundNear(p: XY): number | null {
  let best: { z: number; d: number } | null = null;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (const n of grid.get(`${Math.floor(p.x / 50) + dx},${Math.floor(p.y / 50) + dy}`) ?? []) {
        const d = Math.hypot(n.x - p.x, n.y - p.y);
        if (d <= 60 && (!best || d < best.d)) best = { z: n.z, d };
      }
    }
  }
  return best?.z ?? null;
}

let canopies = 0;
const buildings = buildingData.buildings.flatMap((b) => {
  const rings = b.geometry?.rings ?? [];
  return rings
    .filter((r) => r.length >= 3)
    .map((ring) => {
      const footprint = ring.map(([lng, lat]) => proj.toXY({ lng, lat }));
      const c = {
        x: footprint.reduce((s, p) => s + p.x, 0) / footprint.length,
        y: footprint.reduce((s, p) => s + p.y, 0) / footprint.length,
      };
      const { TopHeight, BaseHeight } = b.attributes;
      // No height = open-sided structures (covered walkways, shelters): shade right underneath.
      if (TopHeight === null) {
        canopies++;
        return { footprint, height: 0 };
      }
      const ground = groundNear(c) ?? BaseHeight ?? TopHeight;
      return { footprint, height: Math.min(200, Math.max(0, TopHeight - ground)) };
    });
});

// ---- tree crowns --------------------------------------------------------------------------
const TREE_RADIUS_M = 4;
const ROW_RADIUS_M = 3;
const treePolys: XY[][] = [];
for (const el of treeData.elements) {
  if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
    treePolys.push(circlePolygon(proj.toXY({ lat: el.lat, lng: el.lon }), TREE_RADIUS_M));
  } else if (el.type === 'way' && el.geometry && el.tags?.natural === 'tree_row') {
    // A row of trees: a crown every 5 m along the line.
    const pts = el.geometry.map((g) => proj.toXY({ lat: g.lat, lng: g.lon }));
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 5));
      for (let k = 0; k <= n; k++) {
        treePolys.push(
          circlePolygon(
            { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n },
            ROW_RADIUS_M,
          ),
        );
      }
    }
  } else if (el.type === 'way' && el.geometry && el.geometry.length >= 3) {
    treePolys.push(el.geometry.map((g) => proj.toXY({ lat: g.lat, lng: g.lon }))); // a wood
  }
}
const treeIndex = new ShadeIndex(treePolys);

// ---- shade per edge per time bucket -------------------------------------------------------
const mainIds = new Set(main.map((n) => n.id));
const edges = graph.edges.filter((e) => mainIds.has(e.source) && mainIds.has(e.target));
const lines = edges.map((e) => e.coords.map(([lng, lat]) => proj.toXY({ lng, lat })));
const shade = edges.map(() => [] as number[]);

for (let i = 0; i < SHADE_BUCKETS; i++) {
  const sun = sunPosition(bucketTime(day, i), DEMO_CENTER.lat, DEMO_CENTER.lng);
  if (sun.altitude_deg <= 0) {
    // Sun down: nothing is in the sun. Routing ignores sun at night anyway.
    edges.forEach((_, k) => shade[k]!.push(100));
    continue;
  }
  const shadows = buildings
    .map((b) => shadowPolygon(b.footprint, b.height, sun))
    .filter((p): p is XY[] => p !== null);
  const indexes = [new ShadeIndex(shadows), treeIndex];
  edges.forEach((e, k) => {
    const covered = e.covered || e.indoor;
    shade[k]!.push(covered ? 100 : Math.round(lineShadeFraction(lines[k]!, indexes) * 100));
  });
}
const treeCover = edges.map((e, k) => Math.round(lineShadeFraction(lines[k]!, [treeIndex]) * 100));

// ---- report + save ------------------------------------------------------------------------
const outdoor = edges.map((e, k) => ({ e, k })).filter(({ e }) => !e.covered && !e.indoor);
const avgAt = (i: number) => {
  const total = outdoor.reduce((s, { e }) => s + e.length_m, 0);
  return Math.round(
    (outdoor.reduce((s, { e, k }) => s + (shade[k]![i]! / 100) * e.length_m, 0) / total) * 100,
  );
};
console.log(
  `Shade for ${day}: ${buildings.length} building footprints (${canopies} canopies), ${treePolys.length} tree crowns/woods, ${edges.length} edges`,
);
for (const [label, i] of [
  ['09:00', 4],
  ['11:00', 8],
  ['13:00', 12],
  ['15:00', 16],
  ['17:00', 20],
] as const) {
  const sun = sunPosition(bucketTime(day, i), DEMO_CENTER.lat, DEMO_CENTER.lng);
  console.log(
    `  ${label}: sun ${Math.round(sun.altitude_deg)}° high, ${Math.round(sun.azimuth_deg)}° — open-air paths ${avgAt(i)}% shaded`,
  );
}
fs.writeFileSync(
  path.join(here, 'data', 'shade.json'),
  JSON.stringify({
    date: day,
    firstMin: SHADE_FIRST_MIN,
    bucketMin: SHADE_BUCKET_MIN,
    edges: edges.map((e, k) => [e.id, shade[k], treeCover[k]]),
  }),
);
console.log(
  `✓ Saved scripts/graph/data/shade.json in ${Math.round((Date.now() - started) / 1000)} s`,
);
