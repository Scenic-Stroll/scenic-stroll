// Draws our route lines as MapLibre layers, keeping them in zIndex order, and finds which line
// was tapped. Separate from the React components so it can redraw everything after a style change
// (switching light/dark replaces the whole map style, which removes our layers).
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';

import type { LineSpec } from './context';

const PREFIX = 'scenic-line-';
/** Taps within this many pixels of a line count as tapping it (lines are thin on a phone). */
const TAP_SLOP_PX = 8;

const layerId = (id: string) => `${PREFIX}${id}`;

function lineData(spec: LineSpec): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: spec.coordinates },
  };
}

/** react-native-maps dashes are in pixels; MapLibre's are in multiples of the line width. */
function dashArray(spec: LineSpec): number[] | undefined {
  return spec.dash?.map((px) => Math.max(px / spec.width, 0.1));
}

/** Our existing layer to insert `spec` below: the lowest one that should be drawn above it. */
function layerAbove(map: MapLibreMap, lines: Map<string, LineSpec>, self: string, z: number) {
  let best: { id: string; z: number } | null = null;
  for (const [id, other] of lines) {
    if (id === self || other.z <= z || !map.getLayer(layerId(id))) continue;
    if (!best || other.z < best.z) best = { id, z: other.z };
  }
  return best ? layerId(best.id) : undefined;
}

export function drawLine(map: MapLibreMap, lines: Map<string, LineSpec>, id: string) {
  const spec = lines.get(id);
  if (!spec || !map.isStyleLoaded()) return;
  const lid = layerId(id);
  const source = map.getSource(lid) as GeoJSONSource | undefined;
  if (source) source.setData(lineData(spec));
  else map.addSource(lid, { type: 'geojson', data: lineData(spec) });

  if (map.getLayer(lid)) {
    map.setPaintProperty(lid, 'line-color', spec.color);
    map.setPaintProperty(lid, 'line-width', spec.width);
    map.setPaintProperty(lid, 'line-dasharray', dashArray(spec));
    map.moveLayer(lid, layerAbove(map, lines, id, spec.z));
  } else {
    map.addLayer(
      {
        id: lid,
        type: 'line',
        source: lid,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': spec.color,
          'line-width': spec.width,
          ...(spec.dash ? { 'line-dasharray': dashArray(spec) } : {}),
        },
      },
      layerAbove(map, lines, id, spec.z),
    );
  }
}

export function eraseLine(map: MapLibreMap, id: string) {
  const lid = layerId(id);
  if (map.getLayer(lid)) map.removeLayer(lid);
  if (map.getSource(lid)) map.removeSource(lid);
}

/** The top-most tappable line near a screen point, if any. */
export function tappedLine(
  map: MapLibreMap,
  lines: Map<string, LineSpec>,
  point: { x: number; y: number },
): LineSpec | undefined {
  const ids = [...lines.entries()]
    .filter(([id, spec]) => spec.onPress && map.getLayer(layerId(id)))
    .map(([id]) => layerId(id));
  if (ids.length === 0) return undefined;
  const hits = map.queryRenderedFeatures(
    [
      [point.x - TAP_SLOP_PX, point.y - TAP_SLOP_PX],
      [point.x + TAP_SLOP_PX, point.y + TAP_SLOP_PX],
    ],
    { layers: ids },
  );
  return hits
    .map((f) => lines.get(f.layer.id.slice(PREFIX.length)))
    .filter((s): s is LineSpec => !!s)
    .sort((a, b) => b.z - a.z)[0];
}
