/**
 * "This path is blocked" reports (smart routing step 6). Reports are anonymous and last 3 hours;
 * the server snaps them to the nearest walking-graph path and smart-route routes around them.
 * Everyone following a route gets new reports through Realtime and re-plans if theirs is hit.
 */
import { pointFromPostgis, type LatLng } from '@scenic/shared';

import { supabase } from '@/lib/supabase';

export type PathReport = { id: number; edge_id: number; point: LatLng };

/** Turns database errors into something a walker can read. */
function friendly(message: string): string {
  if (/No path within/.test(message)) return 'There’s no mapped path right there to report.';
  if (/Too many reports/.test(message)) return 'You’ve sent a lot of reports — try again later.';
  if (/No walking graph/.test(message)) return 'Path reports aren’t available right now.';
  return 'Couldn’t send the report — check your connection.';
}

/** Reports the path nearest `point` as blocked (or extends an existing report). */
export async function reportBlockedPath(point: LatLng): Promise<{ id: number; edge_id: number }> {
  const { data, error } = await supabase.rpc('report_blocked_path', {
    p_lat: point.lat,
    p_lng: point.lng,
  });
  if (error) throw new Error(friendly(error.message));
  const row = (data as { id: number; edge_id: number }[] | null)?.[0];
  if (!row) throw new Error(friendly(''));
  return row;
}

/** Removes my own active reports ("Undo", or after a demo run). Returns how many. */
export async function clearMyPathReports(): Promise<number> {
  const { data, error } = await supabase.rpc('clear_my_path_reports');
  if (error) throw new Error(friendly(error.message));
  return (data as number) ?? 0;
}

/**
 * Calls `onReport` for every new report while subscribed. Returns the unsubscribe function.
 * A unique channel name per subscription (see subscribeToFriendLocations for why).
 */
export function subscribeToPathReports(onReport: (r: PathReport) => void): () => void {
  const channel = supabase
    .channel(`path-reports-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'path_reports' }, (msg) => {
      const row = msg.new as { id: number; edge_id: number; point: unknown };
      const point = pointFromPostgis(row.point); // Realtime sends GeoJSON
      if (point) onReport({ id: row.id, edge_id: row.edge_id, point });
    })
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
