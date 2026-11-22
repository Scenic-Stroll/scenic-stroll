/**
 * Groups map markers that would overlap when zoomed out (D54). One small function for both maps:
 * MapLibre (web) could cluster by itself, react-native-maps (phones) can't, and this way they look
 * the same. Grid clustering: the map is cut into cells about CELL_PX pixels wide at the current
 * zoom; markers in the same cell become one cluster at their average position.
 */
const CELL_PX = 56;
/** From this zoom on (street level) markers are never grouped. */
export const CLUSTER_MAX_ZOOM = 17;

export type Clusterable = { id: string; lat: number; lng: number };

export type Cluster<T extends Clusterable> =
  | { kind: 'single'; item: T }
  | { kind: 'cluster'; id: string; lat: number; lng: number; items: T[] };

/** Google-style zoom from the map's visible width in degrees of longitude. */
export function zoomFromLongitudeDelta(longitudeDelta: number): number {
  return Math.log2(360 / Math.max(longitudeDelta, 1e-9));
}

export function clusterMarkers<T extends Clusterable>(
  items: readonly T[],
  zoom: number,
): Cluster<T>[] {
  if (zoom >= CLUSTER_MAX_ZOOM) return items.map((item) => ({ kind: 'single', item }));
  // Width of one cell in degrees: 256-px world tile × 2^zoom pixels around the world.
  const cellDeg = (CELL_PX * 360) / (256 * 2 ** zoom);
  const cells = new Map<string, T[]>();
  for (const item of items) {
    const key = `${Math.floor(item.lng / cellDeg)}:${Math.floor(item.lat / cellDeg)}`;
    const cell = cells.get(key);
    if (cell) cell.push(item);
    else cells.set(key, [item]);
  }
  return [...cells.entries()].map(([key, group]): Cluster<T> => {
    if (group.length === 1) return { kind: 'single', item: group[0]! };
    return {
      kind: 'cluster',
      id: `cluster:${key}`,
      lat: group.reduce((s, i) => s + i.lat, 0) / group.length,
      lng: group.reduce((s, i) => s + i.lng, 0) / group.length,
      items: group,
    };
  });
}
