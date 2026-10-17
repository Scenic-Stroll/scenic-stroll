import type { LatLng } from '@scenic/shared';

/** A chosen start or destination: a landmark, a search result, a dropped pin or "My location". */
export type Place = {
  label: string;
  point: LatLng;
  /** Set when the place is one of our landmarks (shared/src/presets.ts). */
  presetId?: string;
  /** Set when the place is a bus/minibus stop or MTR station (Transit stops layer). */
  stopId?: string;
  /** 'friend' = a friend's shared live location. */
  kind?: 'friend';
  /** Extra line under the type, e.g. "Shared 2 min ago · approximate (~200 m)". */
  note?: string;
};

/** Stable id for saving a place: the landmark id, or its coordinates (~1 m precision). */
export function placeId(place: Place): string {
  return place.presetId ?? `${place.point.lat.toFixed(5)},${place.point.lng.toFixed(5)}`;
}
