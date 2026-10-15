// Loads the part of the walking graph a trip needs: a box around its start and end plus a margin
// (TRIP_MARGIN_M), ~2,500–5,000 edges, in one database call (~150 ms).
// Why per request and not kept in memory: hosted Edge Functions start a fresh worker for almost
// every request, so a cached whole graph (10,000+ edges) was re-loaded every time and took 1–3 s.
import type { SupabaseContext } from '@supabase/server';

import { tripBbox } from './scenic/graph-area.ts';
import { parseGraphExport } from './scenic/graph-export.ts';
import { prepareGraph, type PreparedGraph } from './scenic/router.ts';
import type { LatLng } from './scenic/schemas.ts';

/** The graph around a trip, or null if no graph is loaded. Throws if the database can't be read. */
export async function loadTripGraph(
  client: SupabaseContext['supabase'],
  origin: LatLng,
  destination: LatLng,
): Promise<PreparedGraph | null> {
  const box = tripBbox(origin, destination);
  const { data, error } = await client.rpc('walking_graph_export', {
    p_min_lng: box.minLng,
    p_min_lat: box.minLat,
    p_max_lng: box.maxLng,
    p_max_lat: box.maxLat,
  });
  if (error) throw error;
  return data ? prepareGraph(parseGraphExport(data)) : null;
}
