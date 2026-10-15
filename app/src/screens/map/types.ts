import type { LatLng } from '@scenic/shared';

/** A chosen start or destination: a landmark, a search result, a dropped pin or "My location". */
export type Place = { label: string; point: LatLng };
