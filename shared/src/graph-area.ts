/**
 * The area our own walking graph covers (Kowloon Tong MTR, Festival Walk, CityU and the streets around,
 * about 1.5 km × 1.5 km). Outside it, smart routing falls back to the standard route.
 * To cover more: widen this box, then rebuild the graph (docs/SETUP.md → "Walking graph").
 */
import type { LatLng } from './schemas.ts';

export const GRAPH_BBOX = {
  minLat: 22.3297,
  maxLat: 22.3433,
  minLng: 114.1662,
  maxLng: 114.1808,
} as const;

export function isInGraphArea(p: LatLng): boolean {
  return (
    p.lat >= GRAPH_BBOX.minLat &&
    p.lat <= GRAPH_BBOX.maxLat &&
    p.lng >= GRAPH_BBOX.minLng &&
    p.lng <= GRAPH_BBOX.maxLng
  );
}

/**
 * The graph is downloaded with this margin around GRAPH_BBOX. Why: paths near the edge often join
 * the rest of the network just outside the box; cut there, they'd become disconnected scraps.
 */
export const GRAPH_DOWNLOAD_MARGIN_M = 300;

/** GRAPH_BBOX grown by GRAPH_DOWNLOAD_MARGIN_M on every side. */
export function graphDownloadBbox() {
  const dLat = GRAPH_DOWNLOAD_MARGIN_M / 110_574;
  const dLng = GRAPH_DOWNLOAD_MARGIN_M / (111_320 * Math.cos((22.3365 * Math.PI) / 180));
  return {
    minLat: GRAPH_BBOX.minLat - dLat,
    maxLat: GRAPH_BBOX.maxLat + dLat,
    minLng: GRAPH_BBOX.minLng - dLng,
    maxLng: GRAPH_BBOX.maxLng + dLng,
  };
}

/** Margin around a trip's start and end when loading part of the graph (detours rarely go further). */
export const TRIP_MARGIN_M = 400;

/** The box around origin + destination, grown by `marginM` — the part of the graph a trip needs. */
export function tripBbox(a: LatLng, b: LatLng, marginM = TRIP_MARGIN_M) {
  const dLat = marginM / 110_574;
  const dLng = marginM / (111_320 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180));
  return {
    minLat: Math.min(a.lat, b.lat) - dLat,
    maxLat: Math.max(a.lat, b.lat) + dLat,
    minLng: Math.min(a.lng, b.lng) - dLng,
    maxLng: Math.max(a.lng, b.lng) + dLng,
  };
}
