import type { LatLng } from '@scenic/shared';

/** A chosen start or destination: a landmark, a search result, a dropped pin or "My location". */
export type Place = {
  label: string;
  point: LatLng;
  /** Set when the place is one of our landmarks (shared/src/presets.ts). */
  presetId?: string;
};

/** Stable id for saving a place: the landmark id, or its coordinates (~1 m precision). */
export function placeId(place: Place): string {
  return place.presetId ?? `${place.point.lat.toFixed(5)},${place.point.lng.toFixed(5)}`;
}
