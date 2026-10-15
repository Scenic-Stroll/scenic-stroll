// Step 2 of building our walking graph: turn the downloaded 3DPN segments into nodes + edges with
// walking attributes, apply our manual fixes, check connectivity, and save scripts/graph/data/graph.json.
// Run: npm run graph:build      (after npm run graph:download)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildTopology,
  componentSizes,
  edgeAttributesFrom3dpn,
  isUsableSegment,
  markMtrExits,
  openingHoursFrom3dpn,
  type Dpn3Attributes,
  type SegmentInput,
} from '../../shared/src/graph-build.ts';
import { PRESETS } from '../../shared/src/presets.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(fs.readFileSync(path.join(here, 'data', '3dpn.json'), 'utf8'));

type AccessTime = { AccessTimeID: number; AccessTimeType: string; DescriptionEN: string };
type AccessDetail = { AccessTimeID: number; DayCode: string; FromTime: number; ToTime: number };
type Floor = { FloorID: number; EnglishName: string };

// Opening hours per AccessTimeID.
const hours = new Map<number, string | null>();
for (const t of raw.accessTimes as AccessTime[]) {
  const details = (raw.accessTimeDetails as AccessDetail[]).filter(
    (d) => d.AccessTimeID === t.AccessTimeID,
  );
  hours.set(t.AccessTimeID, openingHoursFrom3dpn(t.AccessTimeType, details));
}
const floorName = new Map((raw.floors as Floor[]).map((f) => [f.FloorID, f.EnglishName]));

let skipped = 0;
const segments: SegmentInput[] = [];
for (const r of raw.routes as {
  attributes: Dpn3Attributes;
  geometry: { paths: [number, number, number][][] };
}[]) {
  const a = r.attributes;
  if (!isUsableSegment(a)) {
    skipped++;
    continue;
  }
  for (const coords of r.geometry.paths) {
    segments.push({
      attrs: edgeAttributesFrom3dpn(a, a.AccessTimeID ? (hours.get(a.AccessTimeID) ?? null) : null),
      coords,
      levelName: a.FloorID ? (floorName.get(a.FloorID) ?? null) : null,
      sourceRef: String(a.PedestrianRouteID),
      reversed: a.Direction === -1,
    });
  }
}

const { nodes, edges } = buildTopology(segments);
const exits = PRESETS.filter((p) => p.kind === 'mtr_exit').map((p) => ({ id: p.id, ...p.point }));
const missingExits = markMtrExits(nodes, exits);

// ---- report --------------------------------------------------------------------------------
const sizes = componentSizes(nodes);
const pct = (n: number, of: number) => `${Math.round((n / of) * 1000) / 10}%`;
const countBy = <T,>(items: T[], f: (x: T) => string) =>
  Object.fromEntries(
    Object.entries(
      items.reduce<Record<string, number>>((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {}),
    ).sort((a, b) => b[1] - a[1]),
  );

console.log(
  `Segments: ${raw.routes.length} downloaded, ${skipped} skipped (disabled / proposal / paid area)`,
);
console.log(`Graph: ${nodes.length} nodes, ${edges.length} edges`);
console.log(
  `Connected pieces: ${sizes.length}; biggest has ${sizes[0]} nodes (${pct(sizes[0] ?? 0, nodes.length)}); next: ${sizes.slice(1, 8).join(', ')}`,
);
console.log(
  'Edge kinds:',
  countBy(edges, (e) => e.kind),
);
console.log(
  'Step-free:',
  countBy(edges, (e) => e.step_free),
);
console.log(
  'Node kinds:',
  countBy(nodes, (n) => n.kind),
);
const km = (f: (e: (typeof edges)[number]) => boolean) =>
  Math.round(edges.filter(f).reduce((s, e) => s + e.length_m, 0)) / 1000;
console.log(
  `Length: ${km(() => true)} km total, ${km((e) => e.covered)} km covered, ${km((e) => e.indoor)} km indoor`,
);
console.log(`Edges with opening hours: ${edges.filter((e) => e.opening_hours).length}`);
console.log(
  missingExits.length
    ? `! MTR exits with no node nearby: ${missingExits.join(', ')}`
    : '✓ All MTR exits matched to a node',
);

fs.writeFileSync(
  path.join(here, 'data', 'graph.json'),
  JSON.stringify({
    source: raw.source,
    // The download date in Hong Kong time, e.g. "2026-10-16" (en-CA formats dates as YYYY-MM-DD).
    sourceVersion: new Date(raw.downloadedAt).toLocaleDateString('en-CA', {
      timeZone: 'Asia/Hong_Kong',
    }),
    bbox: raw.bbox,
    nodes,
    edges,
    report: {
      components: sizes.length,
      largestComponentPct: (sizes[0] ?? 0) / nodes.length,
      missingExits,
    },
  }),
);
console.log('✓ Saved scripts/graph/data/graph.json');
