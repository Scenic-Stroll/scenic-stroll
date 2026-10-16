/**
 * The walking graph as the router uses it, and the compact format the database sends it in
 * (public.walking_graph_export(): one JSON value with arrays instead of objects, so ~10,000 edges
 * load in one request: ~2.5 MB, ~0.6 MB gzipped, parsed in ~50 ms).
 *
 * If you add a column to the export, add it at the END of the tuple here and in the SQL function.
 * Extra trailing fields are accepted (`.rest`), so a newer database never breaks an older function.
 */
import { z } from 'zod';

import { decodePolyline } from './geo.ts';
import {
  EDGE_KINDS,
  NODE_KINDS,
  type EdgeKind,
  type NodeKind,
  type StepFree,
} from './graph-kinds.ts';
import type { LatLng } from './schemas.ts';
import type { ShadeMeta } from './shadows.ts';

export type RoutingNode = { id: number; lng: number; lat: number; z: number; kind: NodeKind };

export type RoutingEdge = {
  id: number;
  source: number;
  target: number;
  length_m: number;
  kind: EdgeKind;
  covered: boolean;
  indoor: boolean;
  air_conditioned: boolean;
  step_free: StepFree;
  slope_pct: number;
  z_from: number;
  z_to: number;
  crossing_wait_s: number;
  opening_hours: string | null;
  confidence: number;
  bidirectional: boolean;
  name_en: string | null;
  name_zh: string | null;
  data_source: string;
  level_from: string | null;
  level_to: string | null;
  /** % shaded every 30 min from 07:00 (see ShadeMeta); null = not computed. Covered/indoor = 100. */
  shade: number[] | null;
  /** The line drawn source → target. */
  line: LatLng[];
};

export type WalkingGraph = {
  buildId: number;
  source: string;
  version: string;
  nodes: RoutingNode[];
  edges: RoutingEdge[];
  /** Which day and times `shade` is for; null = no shade computed yet. */
  shadeMeta: ShadeMeta | null;
};

const NodeTuple = z
  .tuple([z.number(), z.number(), z.number(), z.number(), z.enum(NODE_KINDS)])
  .rest(z.unknown());

const EdgeTuple = z
  .tuple([
    z.number(), // 0 id
    z.number(), // 1 source
    z.number(), // 2 target
    z.number(), // 3 length_m
    z.enum(EDGE_KINDS), // 4 kind
    z.boolean(), // 5 covered
    z.boolean(), // 6 indoor
    z.boolean(), // 7 air_conditioned
    z.enum(['yes', 'no', 'unknown']), // 8 step_free
    z.number(), // 9 slope_pct
    z.number().nullable(), // 10 z_from
    z.number().nullable(), // 11 z_to
    z.number(), // 12 crossing_wait_s
    z.string().nullable(), // 13 opening_hours
    z.number(), // 14 confidence
    z.boolean(), // 15 bidirectional
    z.string().nullable(), // 16 name_en
    z.string().nullable(), // 17 name_zh
    z.string(), // 18 encoded polyline, precision 6
    z.string(), // 19 data_source
    z.string().nullable(), // 20 level_from
    z.string().nullable(), // 21 level_to
    z.array(z.number()).nullable().optional(), // 22 shade_pct (step 4)
  ])
  .rest(z.unknown());

export const GraphExportSchema = z.object({
  build_id: z.number(),
  source: z.string(),
  version: z.string(),
  nodes: z.array(NodeTuple),
  edges: z.array(EdgeTuple),
  shade: z
    .object({ date: z.string(), first_min: z.number(), bucket_min: z.number() })
    .nullable()
    .optional(),
});

/** Turns the database export into router objects. Throws if the shape is wrong. */
export function parseGraphExport(raw: unknown): WalkingGraph {
  const g = GraphExportSchema.parse(raw);
  return {
    buildId: g.build_id,
    source: g.source,
    version: g.version,
    shadeMeta: g.shade
      ? { date: g.shade.date, firstMin: g.shade.first_min, bucketMin: g.shade.bucket_min }
      : null,
    nodes: g.nodes.map(([id, lng, lat, z, kind]) => ({ id, lng, lat, z, kind })),
    edges: g.edges.map((e) => ({
      id: e[0],
      source: e[1],
      target: e[2],
      length_m: e[3],
      kind: e[4],
      covered: e[5],
      indoor: e[6],
      air_conditioned: e[7],
      step_free: e[8],
      slope_pct: e[9],
      z_from: e[10] ?? 0,
      z_to: e[11] ?? 0,
      crossing_wait_s: e[12],
      opening_hours: e[13],
      confidence: e[14],
      bidirectional: e[15],
      name_en: e[16],
      name_zh: e[17],
      line: decodePolyline(e[18], 6),
      data_source: e[19],
      level_from: e[20],
      level_to: e[21],
      shade: e[22] ?? null,
    })),
  };
}
