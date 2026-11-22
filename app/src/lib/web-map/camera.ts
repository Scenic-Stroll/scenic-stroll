// Converting between react-native-maps' camera (what our screens use) and MapLibre's.
// Google-style zoom levels count 256 px tiles, MapLibre counts 512 px tiles: one level apart.
import type { LngLatLike } from 'maplibre-gl';

export type MapLatLng = { latitude: number; longitude: number };

export type Camera = {
  center: MapLatLng;
  pitch: number;
  heading: number;
  /** Apple-style height in metres; only used when no zoom is given. */
  altitude?: number;
  /** Google-style zoom level. */
  zoom?: number;
};

export const toLngLat = (p: MapLatLng): LngLatLike => [p.longitude, p.latitude];

export const fromGoogleZoom = (zoom: number) => zoom - 1;
export const toGoogleZoom = (zoom: number) => zoom + 1;

/** Rough height → zoom (matches our pairs: 1100 m ≈ zoom 16.5, 500 m ≈ zoom 18). */
export const altitudeToGoogleZoom = (altitude: number) => 27 - Math.log2(altitude);

/** The zoom (MapLibre scale) for a partial camera, or undefined to keep the current one. */
export function maplibreZoom(camera: Partial<Camera>): number | undefined {
  if (camera.zoom !== undefined) return fromGoogleZoom(camera.zoom);
  if (camera.altitude !== undefined) return fromGoogleZoom(altitudeToGoogleZoom(camera.altitude));
  return undefined;
}
