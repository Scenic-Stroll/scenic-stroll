// <Marker> for the web map. Custom marker views (our dots, stop icons, friend avatars) are React
// Native views rendered into the marker's own HTML element with a portal, so they keep the theme.
// A marker with no children gets a plain pin; a `title` shows in a small popup when tapped.
import { Marker as MapLibreMarker, Popup } from 'maplibre-gl';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { toLngLat, type MapLatLng } from './camera';
import { useWebMap } from './context';

export type MarkerProps = {
  coordinate: MapLatLng;
  /** Which point of the marker sits on the coordinate (0–1 of its width/height). */
  anchor?: { x: number; y: number };
  title?: string;
  description?: string;
  accessibilityLabel?: string;
  zIndex?: number;
  onPress?: () => void;
  children?: ReactNode;
  // Native-only props we accept and ignore on web.
  tracksViewChanges?: boolean;
  identifier?: string;
};

/** A plain red map pin, for markers without a custom view. */
function makePin(): HTMLElement {
  const pin = document.createElement('div');
  pin.style.cssText =
    'width:18px;height:18px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);margin:4px;' +
    'background:#D93025;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.35);';
  return pin;
}

/** Applies anchor, stacking order and accessibility to the marker's HTML (not managed by React). */
function styleMarker(
  outer: HTMLElement,
  inner: HTMLElement,
  o: { x: number; y: number; zIndex?: number; pointer: boolean; label?: string; button: boolean },
) {
  inner.style.transform = `translate(${-o.x * 100}%, ${-o.y * 100}%)`;
  outer.style.zIndex = o.zIndex === undefined ? '' : String(o.zIndex);
  outer.style.cursor = o.pointer ? 'pointer' : '';
  if (o.label) outer.setAttribute('aria-label', o.label);
  if (o.button) outer.setAttribute('role', 'button');
}

export function Marker({
  coordinate,
  anchor,
  title,
  description,
  accessibilityLabel,
  zIndex,
  onPress,
  children,
}: MarkerProps) {
  const { map } = useWebMap();
  const hasView = children !== undefined && children !== null && children !== false;
  // A default pin points with its bottom tip; a custom view is centred, like on the phones.
  const a = anchor ?? (hasView ? { x: 0.5, y: 0.5 } : { x: 0.5, y: 1 });

  // MapLibre moves `outer` around (it owns its CSS transform); `inner` holds our anchor shift.
  const { outer, inner } = useMemo(() => {
    const o = document.createElement('div');
    const i = document.createElement('div');
    o.appendChild(i);
    return { outer: o, inner: i };
  }, []);
  const marker = useRef<MapLibreMarker | null>(null);
  const press = useRef(onPress);
  useEffect(() => {
    press.current = onPress;
  }, [onPress]);

  // Create the marker once per map; position and looks are updated by the effects below.
  useEffect(() => {
    if (!map) return;
    const m = new MapLibreMarker({ element: outer, anchor: 'top-left' })
      .setLngLat(toLngLat(coordinate))
      .addTo(map);
    marker.current = m;
    return () => {
      m.remove();
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, outer]);

  useEffect(() => {
    marker.current?.setLngLat(toLngLat(coordinate));
  }, [coordinate]);

  useEffect(() => {
    styleMarker(outer, inner, {
      x: a.x,
      y: a.y,
      zIndex,
      pointer: !!(onPress || title),
      label: accessibilityLabel ?? title,
      button: !!onPress,
    });
  }, [outer, inner, a.x, a.y, zIndex, onPress, title, accessibilityLabel]);

  // No custom view: show a plain pin.
  useEffect(() => {
    if (hasView) return;
    const pin = makePin();
    inner.appendChild(pin);
    return () => pin.remove();
  }, [inner, hasView]);

  useEffect(() => {
    const popup =
      title && !onPress
        ? new Popup({ offset: 14, closeButton: false }).setText(
            description ? `${title} — ${description}` : title,
          )
        : null;
    if (popup) marker.current?.setPopup(popup);
    const onClick = (e: MouseEvent) => {
      // Don't let the tap also reach the map underneath.
      e.stopPropagation();
      press.current?.();
    };
    outer.addEventListener('click', onClick);
    return () => {
      outer.removeEventListener('click', onClick);
      if (popup) marker.current?.setPopup(null);
    };
  }, [outer, title, description, onPress, map]);

  return hasView ? createPortal(children, inner) : null;
}
