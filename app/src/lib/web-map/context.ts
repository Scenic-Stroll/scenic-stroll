// Lets <Polyline> and <Marker> (children of <MapView>) reach the MapLibre map on web.
import type { Map as MapLibreMap } from 'maplibre-gl';
import { createContext, useContext } from 'react';

/** One line on the map, in MapLibre's terms. */
export type LineSpec = {
  coordinates: [number, number][]; // [lng, lat]
  color: string;
  width: number;
  /** Dash and gap lengths in pixels (react-native-maps style), or undefined for a solid line. */
  dash?: number[];
  /** Higher draws on top. */
  z: number;
  onPress?: () => void;
};

export type WebMapContext = {
  map: MapLibreMap | null;
  setLine: (id: string, spec: LineSpec) => void;
  removeLine: (id: string) => void;
};

export const MapContext = createContext<WebMapContext | null>(null);

export function useWebMap(): WebMapContext {
  const ctx = useContext(MapContext);
  if (!ctx) throw new Error('<Polyline> and <Marker> must be inside <MapView>');
  return ctx;
}
