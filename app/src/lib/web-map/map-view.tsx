// <MapView> for the web: MapLibre GL JS with OpenFreeMap tiles (free, no key — DECISIONS D41),
// behind the same props and ref methods our screens use from react-native-maps on the phones.
// Native-only props (customMapStyle, mapType, showsTraffic, …) are accepted and ignored here.
import 'maplibre-gl/dist/maplibre-gl.css';

import {
  getVersion,
  LngLatBounds,
  Map as MapLibreMap,
  setWorkerUrl,
  type LngLat,
} from 'maplibre-gl';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme, View, type StyleProp, type ViewStyle } from 'react-native';

import { maplibreZoom, toGoogleZoom, toLngLat, type Camera, type MapLatLng } from './camera';
import { MapContext, type LineSpec } from './context';
import { drawLine, eraseLine, tappedLine } from './lines';
import { UserDot } from './user-dot';

const STYLE_URL = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};
// MapLibre decodes map tiles in a background worker. Metro bundles MapLibre into our code, so the
// worker can't be found next to it: scripts/copy-map-worker.mjs publishes it at the site root.
setWorkerUrl(`/maplibre-gl-worker.mjs?v=${getVersion()}`);

/** Hold a finger this long on the map to drop a pin (iPhone Safari has no long-press event). */
const LONG_PRESS_MS = 550;
const LONG_PRESS_SLOP_PX = 10;
const MAX_FIT_ZOOM = 18;

export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};
type EdgePadding = { top: number; right: number; bottom: number; left: number };

export type MapViewProps = {
  style?: StyleProp<ViewStyle>;
  initialCamera?: Camera;
  userInterfaceStyle?: 'light' | 'dark';
  pitchEnabled?: boolean;
  showsUserLocation?: boolean;
  onRegionChangeComplete?: (region: Region) => void;
  onPanDrag?: () => void;
  onLongPress?: (e: { nativeEvent: { coordinate: MapLatLng } }) => void;
  onMapReady?: () => void;
  children?: ReactNode;
  // Phone-only react-native-maps props our screens pass; accepted and ignored on web.
  customMapStyle?: unknown;
  mapType?: string;
  showsBuildings?: boolean;
  showsTraffic?: boolean;
  showsMyLocationButton?: boolean;
  showsCompass?: boolean;
  toolbarEnabled?: boolean;
};

export type MapViewHandle = {
  fitToCoordinates: (
    coords: MapLatLng[],
    options?: { edgePadding?: EdgePadding; animated?: boolean },
  ) => void;
  animateCamera: (camera: Partial<Camera>, options?: { duration?: number }) => void;
  getCamera: () => Promise<Camera>;
};

function regionOf(map: MapLibreMap): Region {
  const b = map.getBounds();
  const c = map.getCenter();
  return {
    latitude: c.lat,
    longitude: c.lng,
    latitudeDelta: b.getNorth() - b.getSouth(),
    longitudeDelta: b.getEast() - b.getWest(),
  };
}

/** Shrink padding that wouldn't leave room for the route (small phone screens), or MapLibre refuses to fit. */
function fitPadding(map: MapLibreMap, p: EdgePadding): EdgePadding {
  const { clientWidth: w, clientHeight: h } = map.getContainer();
  const sx = Math.min(1, (w * 0.7) / Math.max(p.left + p.right, 1));
  const sy = Math.min(1, (h * 0.7) / Math.max(p.top + p.bottom, 1));
  return { top: p.top * sy, bottom: p.bottom * sy, left: p.left * sx, right: p.right * sx };
}

export const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(props, ref) {
  const {
    style,
    initialCamera,
    userInterfaceStyle,
    pitchEnabled = true,
    showsUserLocation,
    children,
  } = props;
  const systemScheme = useColorScheme();
  const scheme = userInterfaceStyle ?? (systemScheme === 'dark' ? 'dark' : 'light');
  const container = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const lines = useRef(new Map<string, LineSpec>());
  // Latest callbacks, so map listeners added once always call the current ones.
  const handlers = useRef(props);
  useEffect(() => {
    handlers.current = props;
  });

  // Create the map once.
  useEffect(() => {
    if (!container.current) return;
    const cam = initialCamera;
    const m = new MapLibreMap({
      container: container.current,
      style: STYLE_URL[scheme],
      center: cam ? toLngLat(cam.center) : [114.1729, 22.3375],
      zoom: (cam && maplibreZoom(cam)) ?? 15.5,
      pitch: cam?.pitch ?? 0,
      bearing: cam?.heading ?? 0,
      pitchWithRotate: pitchEnabled,
      attributionControl: { compact: true },
    });

    // Lines are map layers: redraw them all whenever a (new) style finishes loading.
    m.on('style.load', () => {
      for (const id of lines.current.keys()) drawLine(m, lines.current, id);
    });
    m.on('load', () => {
      handlers.current.onMapReady?.();
      handlers.current.onRegionChangeComplete?.(regionOf(m));
    });
    m.on('moveend', () => handlers.current.onRegionChangeComplete?.(regionOf(m)));
    m.on('dragstart', () => handlers.current.onPanDrag?.());
    m.on('click', (e) => tappedLine(m, lines.current, e.point)?.onPress?.());
    m.on('mousemove', (e) => {
      m.getCanvas().style.cursor = tappedLine(m, lines.current, e.point) ? 'pointer' : '';
    });

    // Long-press to drop a pin: right-click on a computer, hold a finger on a phone.
    const longPress = (lngLat: LngLat) =>
      handlers.current.onLongPress?.({
        nativeEvent: { coordinate: { latitude: lngLat.lat, longitude: lngLat.lng } },
      });
    // Phones: decide when the finger lifts, using the events' own timestamps (when the finger
    // really went down and up). A timer would misfire if the page is briefly busy, turning a
    // normal tap into a dropped pin.
    let press: { at: number; lngLat: LngLat; x: number; y: number } | null = null;
    let lastTouchAt = -Infinity;
    const cancel = () => {
      press = null;
    };
    m.on('touchstart', (e) => {
      lastTouchAt = e.originalEvent.timeStamp;
      press =
        e.originalEvent.touches.length === 1
          ? { at: e.originalEvent.timeStamp, lngLat: e.lngLat, x: e.point.x, y: e.point.y }
          : null;
    });
    m.on('touchend', (e) => {
      lastTouchAt = e.originalEvent.timeStamp;
      if (press && e.originalEvent.timeStamp - press.at >= LONG_PRESS_MS) longPress(press.lngLat);
      press = null;
    });
    // A finger always wobbles a little; only a real drag cancels the press.
    m.on('touchmove', (e) => {
      if (press && Math.hypot(e.point.x - press.x, e.point.y - press.y) > LONG_PRESS_SLOP_PX)
        cancel();
    });
    m.on('movestart', cancel);
    // Computers: right-click. (Android Chrome also sends this after a long touch — skip it then,
    // the touch handler above already dropped the pin.)
    m.on('contextmenu', (e) => {
      if (e.originalEvent.timeStamp - lastTouchAt > 1000) longPress(e.lngLat);
    });

    setMap(m);
    return () => {
      m.remove();
      setMap(null);
    };
    // The map is created once; later prop changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Light / dark base map.
  const shownScheme = useRef(scheme);
  useEffect(() => {
    if (!map || shownScheme.current === scheme) return;
    shownScheme.current = scheme;
    map.setStyle(STYLE_URL[scheme]);
  }, [map, scheme]);

  const setLine = useCallback(
    (id: string, spec: LineSpec) => {
      lines.current.set(id, spec);
      if (map) drawLine(map, lines.current, id);
    },
    [map],
  );
  const removeLine = useCallback(
    (id: string) => {
      lines.current.delete(id);
      if (map) eraseLine(map, id);
    },
    [map],
  );

  useImperativeHandle(
    ref,
    () => ({
      fitToCoordinates(coords, options) {
        if (!map || coords.length === 0) return;
        const bounds = new LngLatBounds();
        for (const c of coords) bounds.extend(toLngLat(c));
        map.fitBounds(bounds, {
          padding: fitPadding(
            map,
            options?.edgePadding ?? { top: 40, right: 40, bottom: 40, left: 40 },
          ),
          duration: options?.animated === false ? 0 : 500,
          maxZoom: MAX_FIT_ZOOM,
        });
      },
      animateCamera(camera, options) {
        map?.easeTo({
          center: camera.center ? toLngLat(camera.center) : undefined,
          zoom: maplibreZoom(camera),
          pitch: camera.pitch,
          bearing: camera.heading,
          duration: options?.duration ?? 500,
        });
      },
      async getCamera() {
        const c = map?.getCenter();
        return {
          center: { latitude: c?.lat ?? 0, longitude: c?.lng ?? 0 },
          zoom: toGoogleZoom(map?.getZoom() ?? 15.5),
          pitch: map?.getPitch() ?? 0,
          heading: map?.getBearing() ?? 0,
        };
      },
    }),
    [map],
  );

  const context = useMemo(() => ({ map, setLine, removeLine }), [map, setLine, removeLine]);

  return (
    <View style={style}>
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
      <MapContext.Provider value={context}>
        {map ? children : null}
        {map && showsUserLocation ? <UserDot /> : null}
      </MapContext.Provider>
    </View>
  );
});
