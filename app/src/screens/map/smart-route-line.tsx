/**
 * Draws a computed route on the map. The chosen route is drawn in coloured stretches — sun orange,
 * shade green, covered blue, indoors purple — with a red dot at each flight of stairs and an icon at
 * lifts/escalators. Other options are a thin plain line you can tap to choose them.
 */
import type { LatLng, SmartRouteOption } from '@scenic/shared';
import { StyleSheet, View } from 'react-native';
import { Marker, Polyline } from 'react-native-maps';

import { runColor } from '@/components/route/route-colors';
import { Icon } from '@/components/ui/icon';
import { useAppTheme } from '@/theme';

const toMap = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng });

export function SmartRouteLine({
  option,
  selected,
  onPress,
}: {
  option: SmartRouteOption;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useAppTheme();

  if (!selected) {
    return (
      <Polyline
        coordinates={option.coordinates.map(toMap)}
        strokeColor={t.accent}
        strokeWidth={4}
        zIndex={2}
        tappable
        onPress={onPress}
      />
    );
  }

  return (
    <>
      {option.runs.map((run, i) => (
        <Polyline
          key={`run-${i}`}
          // `to` is inclusive, so neighbouring stretches share a point and the line has no gaps.
          coordinates={option.coordinates.slice(run.from, run.to + 1).map(toMap)}
          strokeColor={runColor(run.style, t)}
          strokeWidth={8}
          lineDashPattern={run.style === 'open' ? [6, 6] : undefined}
          zIndex={4}
        />
      ))}
      {option.markers.map((m, i) => (
        <Marker
          key={`marker-${i}`}
          coordinate={toMap(m.point)}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
          accessibilityLabel={
            m.kind === 'stairs' ? 'Stairs' : m.kind === 'lift' ? 'Lift' : 'Escalator'
          }
          zIndex={5}
        >
          {m.kind === 'stairs' ? (
            <View
              style={[styles.dot, { backgroundColor: t.routeStairs, borderColor: t.background }]}
            />
          ) : (
            <View
              style={[styles.badge, { backgroundColor: t.routeIndoor, borderColor: t.background }]}
            >
              <Icon
                name={m.kind === 'lift' ? 'elevator' : 'escalator'}
                size={14}
                color={t.background}
              />
            </View>
          )}
        </Marker>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
