// Loads the part of the walking graph a trip needs: a box around its start and end plus a margin
// (TRIP_MARGIN_M), ~2,500–5,000 edges, in one database call (~150 ms). Also the paths walkers
// reported blocked (public.path_reports), which no route may use.
// Why per request and not kept in memory: hosted Edge Functions start a fresh worker for almost
// every request, so a cached whole graph (10,000+ edges) was re-loaded every time and took 1–3 s.
import type { SupabaseContext } from '@supabase/server';

import { tripBbox } from './scenic/graph-area.ts';
import { parseGraphExport } from './scenic/graph-export.ts';
import { prepareGraph, type PreparedGraph } from './scenic/router.ts';
import type { LatLng } from './scenic/schemas.ts';

export type TripGraph = {
  graph: PreparedGraph | null;
  /** Edges walkers reported blocked in the last 3 hours (public.path_reports, step 6). */
  blocked: Set<number>;
};

/**
 * The graph around a trip (null if no graph is loaded) and the paths reported blocked.
 * Throws if the graph can't be read; a failed reports query only logs (routing still works).
 */
export async function loadTripGraph(
  client: SupabaseContext['supabase'],
  origin: LatLng,
  destination: LatLng,
): Promise<TripGraph> {
  const box = tripBbox(origin, destination);
  const [exported, reports] = await Promise.all([
    client.rpc('walking_graph_export', {
      p_min_lng: box.minLng,
      p_min_lat: box.minLat,
      p_max_lng: box.maxLng,
      p_max_lat: box.maxLat,
    }),
    // RLS only shows reports that haven't expired. There are only ever a handful.
    client.from('path_reports').select('build_id, edge_id'),
  ]);
  if (exported.error) throw exported.error;
  const graph = exported.data ? prepareGraph(parseGraphExport(exported.data)) : null;
  if (reports.error) console.error('path_reports read failed:', reports.error.message);
  const blocked = new Set(
    (reports.data ?? [])
      .filter((r) => graph && r.build_id === graph.buildId)
      .map((r) => r.edge_id as number),
  );
  return { graph, blocked };
}
