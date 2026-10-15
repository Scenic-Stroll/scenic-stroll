// Step 1 of building our walking graph: download the Lands Department 3D Pedestrian Network (3DPN)
// for the graph area, with opening hours and floor names. Saves scripts/graph/data/3dpn.json.
// Run: npm run graph:download     (Node 24 runs this TypeScript file directly)
//
// Source: CSDI portal (portal.csdi.gov.hk), dataset landsd_rcd_1637222018065_52265, an ArcGIS
// MapServer. Open data under the DATA.GOV.HK terms — see DECISIONS.md D24.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GRAPH_BBOX, graphDownloadBbox } from '../../shared/src/graph-area.ts';

const SERVICE =
  'https://portal.csdi.gov.hk/server/rest/services/common/landsd_rcd_1637222018065_52265/MapServer';
const LAYER_ROUTES = 0;
const TABLE_ACCESS_TIME = 1005;
const TABLE_ACCESS_TIME_DETAILS = 1006;
const TABLE_FLOORS = 1002;
/** The server returns at most this many rows per request, so we page. */
const PAGE = 2000;

const here = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.join(here, 'data', '3dpn.json');

type EsriFeature = { attributes: Record<string, unknown>; geometry?: { paths: number[][][] } };

async function query(layer: number, params: Record<string, string>): Promise<EsriFeature[]> {
  const rows: EsriFeature[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const url = new URL(`${SERVICE}/${layer}/query`);
    const all = {
      f: 'json',
      resultOffset: String(offset),
      resultRecordCount: String(PAGE),
      ...params,
    };
    for (const [k, v] of Object.entries(all)) url.searchParams.set(k, v);
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`3DPN layer ${layer}: HTTP ${res.status}`);
    const body = (await res.json()) as { features?: EsriFeature[]; error?: unknown };
    if (body.error || !body.features)
      throw new Error(`3DPN layer ${layer}: ${JSON.stringify(body.error)}`);
    rows.push(...body.features);
    console.log(`  layer ${layer}: ${rows.length} rows`);
    if (body.features.length < PAGE) return rows;
  }
}

/** "id IN (1,2,3)" in chunks, so the URL stays short. */
async function queryByIds(layer: number, field: string, ids: number[]): Promise<EsriFeature[]> {
  const rows: EsriFeature[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    rows.push(
      ...(await query(layer, {
        where: `${field} IN (${chunk.join(',')})`,
        outFields: '*',
        orderByFields: 'OBJECTID',
      })),
    );
  }
  return rows;
}

console.log('Downloading 3D Pedestrian Network for the graph area…');
// A margin around the routing area, so edge streets keep their links (see graph-area.ts).
const area = graphDownloadBbox();
const envelope = {
  xmin: area.minLng,
  ymin: area.minLat,
  xmax: area.maxLng,
  ymax: area.maxLat,
  spatialReference: { wkid: 4326 },
};
const routes = await query(LAYER_ROUTES, {
  where: '1=1',
  geometry: JSON.stringify(envelope),
  geometryType: 'esriGeometryEnvelope',
  inSR: '4326',
  spatialRel: 'esriSpatialRelIntersects',
  outSR: '4326', // WGS84 lat/lng, like the rest of the app
  returnZ: 'true', // heights: tell a footbridge from the street under it
  outFields: '*',
  orderByFields: 'OBJECTID',
});

const distinct = (field: string) => [
  ...new Set(
    routes.map((r) => r.attributes[field]).filter((v): v is number => typeof v === 'number'),
  ),
];

const accessIds = distinct('AccessTimeID');
const floorIds = distinct('FloorID');
const accessTimes = (await queryByIds(TABLE_ACCESS_TIME, 'AccessTimeID', accessIds)).map(
  (r) => r.attributes,
);
const accessTimeDetails = (
  await queryByIds(TABLE_ACCESS_TIME_DETAILS, 'AccessTimeID', accessIds)
).map((r) => r.attributes);
const floors = (await queryByIds(TABLE_FLOORS, 'FloorID', floorIds)).map((r) => r.attributes);

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(
  outFile,
  JSON.stringify({
    source: 'lands_3dpn',
    downloadedAt: new Date().toISOString(),
    bbox: GRAPH_BBOX,
    downloadBbox: area,
    routes,
    accessTimes,
    accessTimeDetails,
    floors,
  }),
);
console.log(
  `✓ ${routes.length} path segments, ${accessTimes.length} opening-hours entries, ${floors.length} floors → ${path.relative(process.cwd(), outFile)}`,
);
