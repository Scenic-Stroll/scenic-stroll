// Downloads what shade is computed from, for the graph area + margin:
//   - Lands Department "Building" footprints with BaseHeight / TopHeight (CSDI, open data)
//   - OpenStreetMap trees: single trees, tree rows, woods (Overpass API, ODbL)
// Saves scripts/graph/data/buildings.json and trees.json.
// Run: npm run graph:download-shade      (then npm run graph:shade)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { graphDownloadBbox } from '../../shared/src/graph-area.ts';

const BUILDINGS =
  'https://portal.csdi.gov.hk/server/rest/services/common/landsd_rcd_1637211194312_35158/MapServer/0/query';
const OVERPASS = 'https://overpass-api.de/api/interpreter';
// Overpass refuses requests without a descriptive User-Agent (HTTP 406).
const USER_AGENT = 'ScenicStroll/0.1 (CityU student hackathon prototype)';
const PAGE = 2000;

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, 'data');
const area = graphDownloadBbox();

type EsriPolygon = { attributes: Record<string, unknown>; geometry?: { rings: number[][][] } };

console.log('Downloading building footprints with heights…');
const buildings: EsriPolygon[] = [];
for (let offset = 0; ; offset += PAGE) {
  const url = new URL(BUILDINGS);
  const params = {
    f: 'json',
    where: "Status = 'Active'",
    geometry: JSON.stringify({
      xmin: area.minLng,
      ymin: area.minLat,
      xmax: area.maxLng,
      ymax: area.maxLat,
      spatialReference: { wkid: 4326 },
    }),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outSR: '4326',
    outFields: 'BuildingID,BuildingNameEN,BuildingBlockType,BaseHeight,TopHeight,Storeys',
    orderByFields: 'OBJECTID',
    resultOffset: String(offset),
    resultRecordCount: String(PAGE),
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Buildings: HTTP ${res.status}`);
  const body = (await res.json()) as { features?: EsriPolygon[]; error?: unknown };
  if (!body.features) throw new Error(`Buildings: ${JSON.stringify(body.error)}`);
  buildings.push(...body.features);
  console.log(`  ${buildings.length} buildings`);
  if (body.features.length < PAGE) break;
}

console.log('Downloading trees from OpenStreetMap…');
const box = `${area.minLat},${area.minLng},${area.maxLat},${area.maxLng}`;
const query = `[out:json][timeout:90];(node["natural"="tree"](${box});way["natural"="tree_row"](${box});way["natural"="wood"](${box}););out geom;`;
const treeRes = await fetch(OVERPASS, {
  method: 'POST',
  headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ data: query }),
  signal: AbortSignal.timeout(180_000),
});
if (!treeRes.ok) throw new Error(`Overpass: HTTP ${treeRes.status} — try again in a minute`);
const trees = (await treeRes.json()) as { elements: unknown[] };

fs.mkdirSync(dataDir, { recursive: true });
const downloadedAt = new Date().toISOString();
fs.writeFileSync(
  path.join(dataDir, 'buildings.json'),
  JSON.stringify({ downloadedAt, area, buildings }),
);
fs.writeFileSync(
  path.join(dataDir, 'trees.json'),
  JSON.stringify({ downloadedAt, area, elements: trees.elements }),
);
console.log(
  `✓ ${buildings.length} buildings, ${trees.elements.length} tree features → scripts/graph/data/`,
);
