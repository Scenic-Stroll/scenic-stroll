/**
 * The kinds of edges (pieces of path) and nodes (junctions) in our walking graph. Must match the
 * CHECK constraints in supabase/migrations/*_walking_graph.sql.
 * Kept in its own small file so the smart-route Edge Function doesn't bundle the graph builder.
 */
export const EDGE_KINDS = [
  'footway',
  'crossing',
  'footbridge',
  'subway',
  'indoor_corridor',
  'mall',
  'lift',
  'escalator',
  'stairs',
  'ramp',
] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

export const NODE_KINDS = [
  'street',
  'lift',
  'escalator',
  'stairs_top',
  'stairs_bottom',
  'mrt_exit',
  'building_entrance',
] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export type StepFree = 'yes' | 'no' | 'unknown';
