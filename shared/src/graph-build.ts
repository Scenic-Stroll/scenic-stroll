/**
 * Builds our walking graph from Lands Department 3D Pedestrian Network (3DPN) segments:
 * attributes (covered, indoor, lift, stairs, step-free, opening hours…) and topology (which segments
 * meet). Plain code, run by scripts/graph/build-graph.ts on a laptop and unit-tested here.
 *
 * Why we only join segments at their ENDS (and only at the same height): 3DPN is already a network
 * whose segments meet end-to-end. Two lines that cross on the map without sharing an end are usually
 * on different levels — a footbridge over a road — and must NOT be joined, or routes would "jump" off
 * the bridge into traffic.
 */
import { haversineMeters } from './geo.ts';

// ---- types ---------------------------------------------------------------------------------

import type { EdgeKind, NodeKind, StepFree } from './graph-kinds.ts';
export {
  EDGE_KINDS,
  NODE_KINDS,
  type EdgeKind,
  type NodeKind,
  type StepFree,
} from './graph-kinds.ts';

/** The 3DPN fields we use (names as the Lands Department publishes them). */
export type Dpn3Attributes = {
  PedestrianRouteID: number;
  Location: number; // 1 outdoor, 2 indoor, 3 paid (inside MTR fare gates)
  FeatureType: number;
  AliasNameEN: string | null;
  AliasNameTC: string | null;
  StreetNameEN: string | null;
  StreetNameTC: string | null;
  WeatherProof: number | null; // 1 covered, 2 not covered, 3 unclassified
  WheelchairBarrier: number | null; // 1 = there is a barrier (steps, kerb…)
  Gradient: number | null; // rise / run, e.g. 0.05 = 5 %
  Direction: number | null; // 0 both ways, 1 one way forward, -1 one way backward
  PositionCertainty: number | null; // 1 certain
  Enabled: number | null; // 2 = disabled
  DataSource: number | null; // 9 = proposal (not built yet), 10 = field checked
  FloorID: number | null;
  AccessTimeID: number | null;
};

/** One 3DPN segment: attributes + its line as [lng, lat, height in metres]. */
export type RawSegment = { attrs: Dpn3Attributes; coords: [number, number, number][] };

/** What an edge knows about itself (everything except topology). */
export type EdgeAttributes = {
  kind: EdgeKind;
  covered: boolean;
  indoor: boolean;
  /** Estimated: indoor walkways here are almost all air-conditioned malls, stations or campus. */
  air_conditioned: boolean;
  step_free: StepFree;
  /** Slope in percent (5 = 1 m up per 20 m). Not meaningful for lifts/stairs (they have own speeds). */
  slope_pct: number;
  /** Estimated wait at a crossing, seconds (0 for everything else). */
  crossing_wait_s: number;
  /** OSM-style opening hours, e.g. "Mo-Su 07:00-24:00"; null = always open. */
  opening_hours: string | null;
  /** How much we trust the attributes, 0–1. */
  confidence: number;
  bidirectional: boolean;
  name_en: string | null;
  name_zh: string | null;
};

export type GraphNode = {
  id: number;
  lng: number;
  lat: number;
  /** Height in metres (Hong Kong Principal Datum), from 3DPN. */
  z: number;
  kind: NodeKind;
  is_entrance: boolean;
  /** Which connected piece of the network this node is in (0 = the biggest). */
  component: number;
};

export type GraphEdge = EdgeAttributes & {
  id: number;
  source: number;
  target: number;
  /** The line from source to target (one-way edges always point the allowed way). */
  coords: [number, number][];
  length_m: number;
  z_from: number;
  z_to: number;
  level_from: string | null;
  level_to: string | null;
  /** 3DPN PedestrianRouteID, so a segment can be traced back to the source data. */
  source_ref: string;
};

// ---- attributes ----------------------------------------------------------------------------

const FT = {
  footbridge: [2],
  subway: [4],
  escalator: [8, 16],
  travelator: [9, 17],
  lift: [10, 18],
  ramp: [11, 19],
  stairs: [12, 20],
  stairlift: [13, 21],
  crossing: [30, 31, 32, 33],
} as const;
const is = (ft: number, group: readonly number[]) => group.includes(ft);

/** Typical waits: signalised 45 s (half a cycle), zebra 5 s, cautionary 10 s, other 20 s. */
const CROSSING_WAIT_S: Record<number, number> = { 30: 45, 31: 5, 32: 10, 33: 20 };

function kindOf(ft: number, indoor: boolean): EdgeKind {
  if (is(ft, FT.footbridge)) return 'footbridge';
  if (is(ft, FT.subway)) return 'subway';
  if (is(ft, FT.escalator)) return 'escalator';
  if (is(ft, FT.lift)) return 'lift';
  if (is(ft, FT.ramp)) return 'ramp';
  if (is(ft, FT.stairs) || is(ft, FT.stairlift)) return 'stairs';
  if (is(ft, FT.crossing)) return 'crossing';
  // Footway, travelator, service lane, traffic island, park path, …
  return indoor ? 'indoor_corridor' : 'footway';
}

/**
 * Step-free, conservatively: stairs, escalators and anything 3DPN marks as a wheelchair barrier are
 * "no"; a stairlift is "unknown" (it may be locked or need staff); everything else "yes".
 */
function stepFreeOf(ft: number, barrier: number | null): StepFree {
  if (is(ft, FT.stairs) || is(ft, FT.escalator) || barrier === 1) return 'no';
  if (is(ft, FT.stairlift)) return 'unknown';
  return 'yes';
}

export function edgeAttributesFrom3dpn(
  a: Dpn3Attributes,
  openingHours: string | null,
): EdgeAttributes {
  const indoor = a.Location === 2;
  const kind = kindOf(a.FeatureType, indoor);
  const covered = a.WeatherProof === 1 || indoor || kind === 'subway';
  // Field-checked data is best; positions marked uncertain are trusted less.
  const base = a.DataSource === 10 ? 0.9 : 0.8;
  const confidence = a.PositionCertainty === 1 ? base : base - 0.2;
  return {
    kind,
    covered,
    indoor,
    air_conditioned: indoor && kind !== 'stairs',
    step_free: stepFreeOf(a.FeatureType, a.WheelchairBarrier),
    slope_pct: Math.round((a.Gradient ?? 0) * 1000) / 10,
    crossing_wait_s: CROSSING_WAIT_S[a.FeatureType] ?? 0,
    opening_hours: openingHours,
    confidence,
    bidirectional: (a.Direction ?? 0) === 0,
    name_en: a.AliasNameEN ?? a.StreetNameEN ?? null,
    name_zh: a.AliasNameTC ?? a.StreetNameTC ?? null,
  };
}

/** Segments we must not route on: disabled, proposals (not built yet), inside MTR fare gates. */
export function isUsableSegment(a: Dpn3Attributes): boolean {
  return a.Enabled !== 2 && a.DataSource !== 9 && a.Location !== 3;
}

// ---- opening hours -------------------------------------------------------------------------

const DAY_CODES: Record<string, string> = {
  MON: 'Mo',
  TUE: 'Tu',
  WED: 'We',
  THU: 'Th',
  FRI: 'Fr',
  SAT: 'Sa',
  SUN: 'Su',
  ED: 'Mo-Su',
  WD: 'Mo-Fr',
  WE: 'Sa,Su',
  PH: 'PH',
  // EPH ("eve of public holiday") has no OSM equivalent and is skipped.
};

/** 700 → "07:00"; 2359 → "24:00" (3DPN writes "until midnight" as 23:59). */
function hhmm(t: number): string {
  if (t >= 2359) return '24:00';
  const h = Math.floor(t / 100);
  const m = t % 100;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * 3DPN access times → OSM-style opening hours.
 * OPEN rows list when a link is open; CLOSE rows list when it is closed (e.g. lift maintenance),
 * so they become "Mo-Su 00:00-24:00; We 09:00-11:00 off". Open all day every day → null.
 */
export function openingHoursFrom3dpn(
  type: string,
  details: { DayCode: string; FromTime: number; ToTime: number }[],
): string | null {
  const rules = details
    .filter((d) => DAY_CODES[d.DayCode])
    .map((d) => `${DAY_CODES[d.DayCode]} ${hhmm(d.FromTime)}-${hhmm(d.ToTime)}`);
  if (rules.length === 0) return null;
  if (type === 'CLOSE') return ['Mo-Su 00:00-24:00', ...rules.map((r) => `${r} off`)].join('; ');
  if (rules.length === 1 && rules[0] === 'Mo-Su 00:00-24:00') return null;
  return rules.join('; ');
}

// ---- topology ------------------------------------------------------------------------------

export type BuildOptions = {
  /** Ends this close (horizontally) are simply the same point (3DPN's own precision). */
  exactMeters: number;
  /** A LOOSE end (touching nothing) is joined to another node this close… */
  snapMeters: number;
  /** …if their heights are also this close (floors are ≥ 3 m apart). */
  snapHeightMeters: number;
};
export const DEFAULT_BUILD_OPTIONS: BuildOptions = {
  exactMeters: 0.05,
  snapMeters: 1.5,
  snapHeightMeters: 2,
};

export type SegmentInput = {
  attrs: EdgeAttributes;
  coords: [number, number, number][];
  levelName: string | null;
  sourceRef: string;
  /** 3DPN Direction: -1 means one-way against the drawn direction. */
  reversed: boolean;
};

/** Metres per degree near Kowloon Tong (lat ≈ 22.3°), for fast "is it within 1.5 m" checks. */
const M_PER_DEG_LAT = 110_574;
const M_PER_DEG_LNG = 111_320 * Math.cos((22.3365 * Math.PI) / 180);

/**
 * Turns segments into nodes + edges, in two passes:
 *   1. ends at the same point (within `exactMeters`, same height) become one node;
 *   2. a loose end — a node only one segment touches — is joined to the nearest other node within
 *      `snapMeters` / `snapHeightMeters`, never to the other end of its own segment.
 * Why not snap everything at 1.5 m: a short staircase (a few steps) would collapse into one point and
 * step-free routes would walk straight over it.
 */
export function buildTopology(
  segments: SegmentInput[],
  options: BuildOptions = DEFAULT_BUILD_OPTIONS,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  // Grid of cells `snapMeters` wide → node ids, so each lookup checks only nearby nodes.
  const cell = (lng: number, lat: number) =>
    [
      Math.floor((lng * M_PER_DEG_LNG) / options.snapMeters),
      Math.floor((lat * M_PER_DEG_LAT) / options.snapMeters),
    ] as const;
  /** Nodes within `maxM` horizontally and `snapHeightMeters` vertically of p, nearest first. */
  const near = (p: [number, number, number], maxM: number): number[] => {
    const [cx, cy] = cell(p[0], p[1]);
    const found: [number, number][] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const id of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          const n = nodes[id]!;
          const d = Math.hypot((n.lng - p[0]) * M_PER_DEG_LNG, (n.lat - p[1]) * M_PER_DEG_LAT);
          if (d <= maxM && Math.abs(n.z - p[2]) <= options.snapHeightMeters) found.push([id, d]);
        }
      }
    }
    return found.sort((a, b) => a[1] - b[1]).map(([id]) => id);
  };
  const grid = new Map<string, number[]>();

  const nodeAt = (p: [number, number, number]): number => {
    const same = near(p, options.exactMeters)[0];
    if (same !== undefined) return same;
    const [cx, cy] = cell(p[0], p[1]);
    const id = nodes.length;
    nodes.push({
      id,
      lng: p[0],
      lat: p[1],
      z: p[2],
      kind: 'street',
      is_entrance: false,
      component: -1,
    });
    const key = `${cx},${cy}`;
    grid.set(key, [...(grid.get(key) ?? []), id]);
    return id;
  };

  // Pass 1: exact ends.
  const ends = segments
    .filter((s) => s.coords.length >= 2)
    .map((s) => {
      const coords = s.reversed ? [...s.coords].reverse() : s.coords;
      return { s, coords, a: nodeAt(coords[0]!), b: nodeAt(coords.at(-1)!) };
    });

  // Pass 2: join loose ends. `merged` maps a node to the node it was joined into.
  const degree = new Map<number, number>();
  for (const { a, b } of ends) for (const n of [a, b]) degree.set(n, (degree.get(n) ?? 0) + 1);
  const merged = new Map<number, number>();
  const resolve = (n: number): number => {
    while (merged.has(n)) n = merged.get(n)!;
    return n;
  };
  for (const { a, b } of ends) {
    for (const [loose, other] of [
      [a, b],
      [b, a],
    ] as const) {
      if (degree.get(loose) !== 1 || merged.has(loose)) continue;
      const n = nodes[loose]!;
      const target = near([n.lng, n.lat, n.z], options.snapMeters).find(
        (id) => id !== loose && resolve(id) !== resolve(other) && resolve(id) !== loose,
      );
      if (target !== undefined) merged.set(loose, resolve(target));
    }
  }

  const edges: GraphEdge[] = [];
  for (const { s, coords, a, b } of ends) {
    const source = resolve(a);
    const target = resolve(b);
    if (source === target) continue; // a dot with no length: nothing to walk
    const line = coords.map(([lng, lat]) => [lng, lat] as [number, number]);
    let length = 0;
    for (let i = 1; i < line.length; i++) {
      length += haversineMeters(
        { lng: line[i - 1]![0], lat: line[i - 1]![1] },
        { lng: line[i]![0], lat: line[i]![1] },
      );
    }
    edges.push({
      ...s.attrs,
      id: edges.length,
      source,
      target,
      coords: line,
      length_m: Math.round(length * 100) / 100,
      z_from: coords[0]![2],
      z_to: coords.at(-1)![2],
      level_from: s.levelName,
      level_to: s.levelName,
      source_ref: s.sourceRef,
    });
  }

  // Renumber so node ids are 0…n-1 without the nodes that were joined into others.
  const used = [...new Set(edges.flatMap((e) => [e.source, e.target]))].sort((x, y) => x - y);
  const newId = new Map(used.map((old, i) => [old, i]));
  const finalNodes = used.map((old, i) => ({ ...nodes[old]!, id: i }));
  for (const e of edges) {
    e.source = newId.get(e.source)!;
    e.target = newId.get(e.target)!;
  }

  labelNodes(finalNodes, edges);
  labelComponents(finalNodes, edges);
  return { nodes: finalNodes, edges };
}

/** Node kinds from the edges that meet there. Precedence: lift > escalator > stairs > entrance. */
function labelNodes(nodes: GraphNode[], edges: GraphEdge[]) {
  const touching = new Map<number, GraphEdge[]>();
  for (const e of edges) {
    for (const n of [e.source, e.target]) touching.set(n, [...(touching.get(n) ?? []), e]);
  }
  for (const node of nodes) {
    const es = touching.get(node.id) ?? [];
    const kinds = new Set(es.map((e) => e.kind));
    // Where an indoor walkway meets an outdoor one, there is a door.
    node.is_entrance = es.some((e) => e.indoor) && es.some((e) => !e.indoor);
    if (kinds.has('lift')) node.kind = 'lift';
    else if (kinds.has('escalator')) node.kind = 'escalator';
    else if (kinds.has('stairs')) {
      const stair = es.find((e) => e.kind === 'stairs')!;
      const otherZ = stair.source === node.id ? stair.z_to : stair.z_from;
      node.kind = node.z >= otherZ ? 'stairs_top' : 'stairs_bottom';
    } else if (node.is_entrance) node.kind = 'building_entrance';
  }
}

/** Connected pieces (ignoring one-way), numbered biggest first. */
function labelComponents(nodes: GraphNode[], edges: GraphEdge[]) {
  const parent = nodes.map((n) => n.id);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!; // path halving keeps this fast
      x = parent[x]!;
    }
    return x;
  };
  for (const e of edges) parent[find(e.source)] = find(e.target);

  const sizes = new Map<number, number>();
  for (const n of nodes) sizes.set(find(n.id), (sizes.get(find(n.id)) ?? 0) + 1);
  const order = [...sizes.entries()].sort((a, b) => b[1] - a[1]).map(([root]) => root);
  const rank = new Map(order.map((root, i) => [root, i]));
  for (const n of nodes) n.component = rank.get(find(n.id))!;
}

/** Nodes per component, biggest first — for the build report. */
export function componentSizes(nodes: GraphNode[]): number[] {
  const sizes: number[] = [];
  for (const n of nodes) sizes[n.component] = (sizes[n.component] ?? 0) + 1;
  return sizes;
}

/**
 * Marks the node nearest each MTR exit (within `maxMeters`, outdoors at street level) as 'mrt_exit'.
 * Returns the exits that found no node, so the build can report them.
 */
export function markMtrExits(
  nodes: GraphNode[],
  exits: { id: string; lat: number; lng: number }[],
  maxMeters = 25,
): string[] {
  const missing: string[] = [];
  for (const exit of exits) {
    let best: GraphNode | null = null;
    let bestD = Infinity;
    for (const n of nodes) {
      if (n.component !== 0) continue; // an exit on a disconnected scrap is no use
      const d = haversineMeters(exit, n);
      if (d < bestD) {
        best = n;
        bestD = d;
      }
    }
    if (best && bestD <= maxMeters) {
      best.kind = 'mrt_exit';
      best.is_entrance = true;
    } else missing.push(exit.id);
  }
  return missing;
}
