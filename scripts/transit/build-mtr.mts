// Builds shared/src/transit/mtr-data.ts — the MTR network for our fallback transit planner
// (multimodal step 2), used when Google transit isn't available.
//
// Inputs (in scripts/transit/data/, git-ignored; see docs/SETUP.md → "MTR network"):
//   lines.csv   https://opendata.mtr.com.hk/data/mtr_lines_and_stations.csv   (MTR Corporation via DATA.GOV.HK)
//   (fares are NOT built in: plan-trip loads them from MTR's fares CSV into public.mtr_fares itself,
//    see shared/src/transit/mtr-fares.ts — 9,000 fares would make the function bundle 10× bigger)
//   st-ways.json, st-rels.json  station areas / stop areas from OpenStreetMap (Overpass) for coordinates
// Run: npm run transit:build
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { haversineMeters } from '../../shared/src/geo.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const data = (f: string) => path.join(here, 'data', f);
const csv = (f: string) =>
  fs
    .readFileSync(data(f), 'utf8')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .slice(1)
    .filter((l) => l.trim())
    .map((l) => l.split(',').map((c) => c.replace(/^"|"$/g, '').trim()));

// Official line names and colours (mtr.com.hk route map).
const LINES: Record<string, { en: string; zh: string; color: string }> = {
  AEL: { en: 'Airport Express', zh: '機場快綫', color: '#00888A' },
  DRL: { en: 'Disneyland Resort Line', zh: '迪士尼綫', color: '#F173AC' },
  EAL: { en: 'East Rail Line', zh: '東鐵綫', color: '#5EB6E4' },
  ISL: { en: 'Island Line', zh: '港島綫', color: '#0075C2' },
  KTL: { en: 'Kwun Tong Line', zh: '觀塘綫', color: '#00A040' },
  TML: { en: 'Tuen Ma Line', zh: '屯馬綫', color: '#9A3B26' },
  TCL: { en: 'Tung Chung Line', zh: '東涌綫', color: '#F7943E' },
  TKL: { en: 'Tseung Kwan O Line', zh: '將軍澳綫', color: '#7D499D' },
  TWL: { en: 'Tsuen Wan Line', zh: '荃灣綫', color: '#E2231A' },
  SIL: { en: 'South Island Line', zh: '南港島綫', color: '#CBD300' },
};

/** Not matched in OSM by name (checked 2026-10-18): station centres read off the OSM map. */
const MANUAL: Record<string, { lat: number; lng: number }> = {
  'North Point': { lat: 22.29123, lng: 114.20048 },
  'Yau Tong': { lat: 22.29789, lng: 114.23703 },
};

// ---- stations and line sequences ----------------------------------------------------------
type Row = {
  line: string;
  dir: string;
  code: string;
  id: number;
  zh: string;
  en: string;
  seq: number;
};
const rows: Row[] = csv('lines.csv')
  .filter((r) => r.length >= 7 && r[0])
  .map(([line, dir, code, id, zh, en, seq]) => ({
    line: line!,
    dir: dir!,
    code: code!,
    id: Number(id),
    zh: zh!,
    en: en!,
    seq: Number(seq),
  }));

// One sequence per branch, in the "UT" direction (the opposite direction is the same stations).
const branches = new Map<string, Row[]>();
for (const r of rows) {
  if (!r.dir.endsWith('UT')) continue;
  const key = `${r.line}${r.dir === 'UT' ? '' : `-${r.dir.split('-')[0]}`}`;
  branches.set(key, [...(branches.get(key) ?? []), r]);
}

// ---- coordinates from OpenStreetMap -------------------------------------------------------
type OsmEl = {
  tags?: Record<string, string>;
  center?: { lat: number; lon: number };
  lat?: number;
  lon?: number;
};
const osm: OsmEl[] = ['st-ways.json', 'st-rels.json', 'st-nodes.json']
  .filter((f) => fs.existsSync(data(f)) && fs.readFileSync(data(f), 'utf8').startsWith('{'))
  .flatMap((f) => (JSON.parse(fs.readFileSync(data(f), 'utf8')) as { elements: OsmEl[] }).elements);
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ (mtr )?station$/, '')
    .replace(/^mtr /, '')
    .replace(/[^a-z]/g, '');
/** Prefer real railway stations over same-named bus termini. */
const rank = (e: OsmEl) =>
  e.tags?.railway === 'station' ? 0 : /subway|train|railway/.test(JSON.stringify(e.tags)) ? 1 : 2;
const candidates = new Map<string, OsmEl[]>();
for (const e of osm) {
  for (const k of ['name:en', 'name']) {
    const v = e.tags?.[k];
    if (v) candidates.set(norm(v), [...(candidates.get(norm(v)) ?? []), e]);
  }
}

const stations = new Map<
  number,
  { id: number; code: string; en: string; zh: string; lat: number; lng: number }
>();
for (const r of rows) {
  if (stations.has(r.id)) continue;
  const manual = MANUAL[r.en];
  const best = (candidates.get(norm(r.en)) ?? []).sort((a, b) => rank(a) - rank(b))[0];
  const lat = manual?.lat ?? best?.center?.lat ?? best?.lat;
  const lng = manual?.lng ?? best?.center?.lon ?? best?.lon;
  if (lat === undefined || lng === undefined) throw new Error(`No coordinates for ${r.en}`);
  stations.set(r.id, { id: r.id, code: r.code, en: r.en, zh: r.zh, lat, lng });
}

// Sanity check: neighbouring stations are never more than 12 km apart, except on the airport lines
// (Tsing Yi → Airport is ~18 km). A bigger gap means a name matched the wrong place.
const problems: string[] = [];
for (const [key, seq] of branches) {
  seq.sort((a, b) => a.seq - b.seq);
  for (let i = 1; i < seq.length; i++) {
    const a = stations.get(seq[i - 1]!.id)!;
    const b = stations.get(seq[i]!.id)!;
    const d = haversineMeters(a, b);
    const limit = key.startsWith('AEL') || key.startsWith('TCL') ? 20_000 : 12_000;
    if (d > limit) problems.push(`${key}: ${a.en} → ${b.en} ${Math.round(d)} m`);
  }
}
if (problems.length > 0) throw new Error(`Suspicious station positions:\n${problems.join('\n')}`);

// ---- write -------------------------------------------------------------------------------
const lines = [...branches].map(([key, seq]) => {
  const code = key.split('-')[0]!;
  return {
    key,
    code,
    ...LINES[code]!,
    stations: seq.map((r) => r.id),
  };
});
const out = path.join(here, '..', '..', 'shared', 'src', 'transit', 'mtr-data.ts');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(
  out,
  `// GENERATED by scripts/transit/build-mtr.mts — do not edit. Run: npm run transit:build
// MTR lines and stations: © MTR Corporation Limited, via DATA.GOV.HK.
// Station positions: © OpenStreetMap contributors (ODbL). Used by the fallback transit planner.
/* eslint-disable */
export const MTR_LINES = ${JSON.stringify(lines)} as const;
export const MTR_STATIONS = ${JSON.stringify([...stations.values()])} as const;
`,
);
console.log(
  `✓ ${lines.length} line branches, ${stations.size} stations → ${path.relative(process.cwd(), out)} (${Math.round(fs.statSync(out).size / 1024)} KB)`,
);
