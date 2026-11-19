// <Polyline> for the web map: the subset of react-native-maps' props our screens use.
import { useEffect, useId } from 'react';

import type { MapLatLng } from './camera';
import { useWebMap } from './context';

export type PolylineProps = {
  coordinates: MapLatLng[];
  strokeColor?: string;
  strokeWidth?: number;
  lineDashPattern?: number[];
  zIndex?: number;
  tappable?: boolean;
  onPress?: () => void;
};

export function Polyline({
  coordinates,
  strokeColor = '#000',
  strokeWidth = 1,
  lineDashPattern,
  zIndex = 0,
  tappable,
  onPress,
}: PolylineProps) {
  const { setLine, removeLine } = useWebMap();
  const id = useId();

  useEffect(() => {
    setLine(id, {
      coordinates: coordinates.map((p) => [p.longitude, p.latitude]),
      color: strokeColor,
      width: strokeWidth,
      dash: lineDashPattern && lineDashPattern.length > 0 ? lineDashPattern : undefined,
      z: zIndex,
      onPress: tappable || onPress ? onPress : undefined,
    });
  }, [
    id,
    setLine,
    coordinates,
    strokeColor,
    strokeWidth,
    lineDashPattern,
    zIndex,
    tappable,
    onPress,
  ]);

  useEffect(() => () => removeLine(id), [id, removeLine]);

  return null;
}
