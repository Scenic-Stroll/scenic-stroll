// Builds shared/src/transit/demo-stops.ts (+ stop-routes.ts) — the bus, minibus and MTR stops inside our walking
// graph's area (multimodal step 3), for the map's "Transit stops" layer, stop cards and live ETAs.
//
// Sources (all DATA.GOV.HK, free to reuse with attribution; responses cached in
// scripts/transit/data/stops-cache/, git-ignored, so a rerun doesn't hit the APIs again):
//   KMB/LWB  https://data.etabus.gov.hk/v1/transport/kmb/stop and /route-stop (two calls for all of HK)
//   GMB      https://data.etagmb.gov.hk/route/KLN → /route-stop/{id}/{seq} → /stop/{id}
//   Citybus  https://rt.data.gov.hk/v2/transport/citybus/route/ctb → /route-stop → /stop/{id}
//   MTR      our own MTR_STATIONS (mtr-data.ts)
// GMB and Citybus have no "all stops" list with coordinates, so we walk every route — a few
// thousand small requests, ~5 minutes the first time.
// Run: npm run transit:stops
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GRAPH_BBOX } from '../../shared/src/graph-area.ts';
import { MTR_LINES, MTR_STATIONS } from '../../shared/src/transit/mtr-data.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const cacheDir = path.join(here, 'data', 'stops-cache');
fs.mkdirSync(cacheDir, { recursive: true });

/** GET a JSON URL, cached on disk by URL. Retries a couple of times: these APIs blip now and then. */
async function getJson(url: string): Promise<any> {
  const file = path.join(cacheDir, url.replace(/[^a-z0-9]+/gi, '_').slice(-180) + '.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      fs.writeFileSync(file, JSON.stringify(json));
      return json;
    } catch (err) {
      if (attempt >= 3) throw new Error(`${url}: ${err}`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

/** Run `fn` over `items`, `n` at a time (be polite to the APIs). */
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

const inArea = (lat: number, lng: number) =>
  lat >= GRAPH_BBOX.minLat &&
  lat <= GRAPH_BBOX.maxLat &&
  lng >= GRAPH_BBOX.minLng &&
  lng <= GRAPH_BBOX.maxLng;

type Stop = {
  id: string;
  operator: 'mtr' | 'kmb' | 'ctb' | 'gmb';
  code: string;
  name_en: string;
  name_zh: string;
  lat: number;
  lng: number;
  routes: string[];
};
const stops: Stop[] = [];
/** GMB's arrival API names routes by id; the stop card needs the number and destination. */
type GmbRoute = { code: string; dest: Record<string, { en: string; zh: string }> };
const gmbRoutes: Record<string, GmbRoute> = {};
const round = (x: number) => Math.round(x * 1e6) / 1e6;

// ---- KMB / LWB --------------------------------------------------------------------------------
{
  const all = (await getJson('https://data.etabus.gov.hk/v1/transport/kmb/stop')).data as any[];
  const routeStops = (await getJson('https://data.etabus.gov.hk/v1/transport/kmb/route-stop'))
    .data as any[];
  for (const s of all) {
    const [lat, lng] = [Number(s.lat), Number(s.long)];
    if (!inArea(lat, lng)) continue;
    const routes = [...new Set(routeStops.filter((r) => r.stop === s.stop).map((r) => r.route))];
    if (routes.length === 0) continue; // stops with no route are old or temporary
    stops.push({
      id: `kmb:${s.stop}`,
      operator: 'kmb',
      code: s.stop,
      // KMB writes names in capitals with an internal code: "KENT ROAD (KC577)" → "Kent Road".
      name_en: titleCase(String(s.name_en).replace(/\s*\([A-Z]{2}\d+\)\s*$/, '')),
      name_zh: String(s.name_tc).replace(/\s*\([A-Z]{2}\d+\)\s*$/, ''),
      lat: round(lat),
      lng: round(lng),
      routes: routes.sort(byRoute),
    });
  }
  console.log(`KMB: ${stops.length} stops in the area`);
}

// ---- Green minibus (Kowloon routes; the demo area is in Kowloon) ------------------------------
{
  const codes = (await getJson('https://data.etagmb.gov.hk/route/KLN')).data.routes as string[];
  const routes = (
    await pool(
      codes,
      6,
      async (c) => (await getJson(`https://data.etagmb.gov.hk/route/KLN/${c}`)).data,
    )
  ).flat() as any[];
  const stopRoutes = new Map<number, Set<string>>();
  const stopNames = new Map<number, { en: string; zh: string }>();
  const stopRouteIds = new Map<number, Set<any>>();
  await pool(
    routes.flatMap((r) => r.directions.map((d: any) => ({ r, seq: d.route_seq }))),
    6,
    async ({ r, seq }) => {
      const json = await getJson(`https://data.etagmb.gov.hk/route-stop/${r.route_id}/${seq}`);
      for (const s of json.data?.route_stops ?? []) {
        if (!stopRoutes.has(s.stop_id)) stopRoutes.set(s.stop_id, new Set());
        stopRoutes.get(s.stop_id)!.add(r.route_code);
        if (!stopRouteIds.has(s.stop_id)) stopRouteIds.set(s.stop_id, new Set());
        stopRouteIds.get(s.stop_id)!.add(r);
        stopNames.set(s.stop_id, { en: s.name_en, zh: s.name_tc });
      }
    },
  );
  let n = 0;
  await pool([...stopRoutes.keys()], 8, async (id) => {
    const json = await getJson(`https://data.etagmb.gov.hk/stop/${id}`);
    const c = json.data?.coordinates?.wgs84;
    if (!c || !inArea(c.latitude, c.longitude)) return;
    n++;
    stops.push({
      id: `gmb:${id}`,
      operator: 'gmb',
      code: String(id),
      name_en: stopNames.get(id)!.en,
      name_zh: stopNames.get(id)!.zh,
      lat: round(c.latitude),
      lng: round(c.longitude),
      routes: [...stopRoutes.get(id)!].sort(byRoute),
    });
    for (const r of stopRouteIds.get(id)!) {
      gmbRoutes[r.route_id] = {
        code: r.route_code,
        dest: Object.fromEntries(
          r.directions.map((d: any) => [d.route_seq, { en: d.dest_en, zh: d.dest_tc }]),
        ),
      };
    }
  });
  console.log(`GMB: ${n} stops in the area (of ${stopRoutes.size} Kowloon minibus stops)`);
}

// ---- Citybus ---------------------------------------------------------------------------------
{
  const routes = (await getJson('https://rt.data.gov.hk/v2/transport/citybus/route/ctb'))
    .data as any[];
  const stopRoutes = new Map<string, Set<string>>();
  await pool(
    routes.flatMap((r) => ['inbound', 'outbound'].map((dir) => ({ route: r.route, dir }))),
    6,
    async ({ route, dir }) => {
      const json = await getJson(
        `https://rt.data.gov.hk/v2/transport/citybus/route-stop/CTB/${route}/${dir}`,
      );
      for (const s of json.data ?? []) {
        if (!stopRoutes.has(s.stop)) stopRoutes.set(s.stop, new Set());
        stopRoutes.get(s.stop)!.add(route);
      }
    },
  );
  let n = 0;
  await pool([...stopRoutes.keys()], 8, async (id) => {
    const s = (await getJson(`https://rt.data.gov.hk/v2/transport/citybus/stop/${id}`)).data;
    const [lat, lng] = [Number(s?.lat), Number(s?.long)];
    if (!inArea(lat, lng)) return;
    n++;
    stops.push({
      id: `ctb:${id}`,
      operator: 'ctb',
      code: id,
      name_en: String(s.name_en).replace(/,.*$/, ''),
      name_zh: String(s.name_tc).replace(/,.*$/, ''),
      lat: round(lat),
      lng: round(lng),
      routes: [...stopRoutes.get(id)!].sort(byRoute),
    });
  });
  console.log(`Citybus: ${n} stops in the area (of ${stopRoutes.size})`);
}

// ---- MTR stations (Next Train covers every heavy-rail line) ----------------------------------
const seen = new Set<string>();
for (const s of MTR_STATIONS) {
  if (!inArea(s.lat, s.lng) || seen.has(s.code)) continue;
  seen.add(s.code);
  const lines = MTR_LINES.filter((l) =>
    MTR_STATIONS.some((o) => o.code === s.code && (l.stations as readonly number[]).includes(o.id)),
  );
  stops.push({
    id: `mtr:${s.code}`,
    operator: 'mtr',
    code: s.code,
    name_en: s.en,
    name_zh: s.zh,
    lat: s.lat,
    lng: s.lng,
    routes: [...new Set(lines.map((l) => l.code))],
  });
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}
function byRoute(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true });
}

stops.sort((a, b) => a.operator.localeCompare(b.operator) || a.name_en.localeCompare(b.name_en));
const outDir = path.join(here, '..', '..', 'shared', 'src', 'transit');
const header = `// GENERATED by scripts/transit/build-stops.mts — do not edit by hand (npm run transit:stops).
// Data: KMB, Citybus, GMB and MTR via DATA.GOV.HK (free to reuse with attribution; see DECISIONS.md D33).
/* eslint-disable */
`;
// 1. Every stop with name and position — for the app (map layer, stop card).
fs.writeFileSync(
  path.join(outDir, 'demo-stops.ts'),
  `${header}// Bus, minibus and MTR stops inside our walking graph's area.
import type { TransitStop } from './eta-schema.ts';

export const DEMO_STOPS: TransitStop[] = [
${stops.map((s) => JSON.stringify(s)).join(',\n')},
];
`,
);
// 2. Only what the eta function needs to ask the operators — small, so the function stays small.
const ctbRoutes = Object.fromEntries(
  stops.filter((s) => s.operator === 'ctb').map((s) => [s.code, s.routes]),
);
fs.writeFileSync(
  path.join(outDir, 'stop-routes.ts'),
  `${header}import type { GmbRoute } from './eta-schema.ts';

/** Citybus stop code → routes calling there (Citybus needs one ETA call per route). */
export const CTB_STOP_ROUTES: Record<string, string[]> = ${JSON.stringify(ctbRoutes)};

/** Green minibus route id → number and destination per direction (route_seq). */
export const GMB_ROUTES: Record<string, GmbRoute> = ${JSON.stringify(gmbRoutes)};
`,
);
console.log(`Wrote ${stops.length} stops to shared/src/transit/demo-stops.ts and stop-routes.ts`);
