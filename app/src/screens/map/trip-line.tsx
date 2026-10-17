/**
 * A trip option on the map (All / Transit / Car tabs). Car legs are coloured by traffic — green
 * flowing, orange slow, red jam — or a dashed grey line when traffic isn't live. Transit legs are
 * drawn in the line's own colour with a dot where you board and get off. Walking legs use the
 * accent colour (the Walk tab draws them in full shade/shelter colours). Unselected options are
 * thin lines you can tap to choose them.
 */
import type { LatLng, TripLeg, TripOption } from '@scenic/shared';
import { StyleSheet, View } from 'react-native';
import { Marker, Polyline } from 'react-native-maps';

import { useAppTheme, type Palette } from '@/theme';

const toMap = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng });

function trafficColor(level: 'free' | 'slow' | 'jam', t: Palette) {
  return level === 'jam' ? t.trafficJam : level === 'slow' ? t.trafficSlow : t.trafficFree;
}

function LegLines({ leg, id }: { leg: TripLeg; id: string }) {
  const t = useAppTheme();
  if (leg.mode === 'car' || leg.mode === 'taxi') {
    const segments = leg.traffic_segments ?? [];
    if (segments.length === 0) {
      return (
        <Polyline
          coordinates={leg.geometry.map(toMap)}
          strokeColor={t.routeStandard}
          strokeWidth={6}
          lineDashPattern={[10, 6]}
          zIndex={3}
        />
      );
    }
    return (
      <>
        {segments.map((s, i) => (
          <Polyline
            key={`${id}-t${i}`}
            coordinates={leg.geometry.slice(s.from, s.to + 1).map(toMap)}
            strokeColor={trafficColor(s.level, t)}
            strokeWidth={7}
            zIndex={3}
          />
        ))}
      </>
    );
  }
  if (leg.mode === 'transit') {
    // The line in its own colour, with a dot where you get on and off.
    const color = leg.color ?? t.textPrimary;
    const ends = [leg.geometry[0]!, leg.geometry.at(-1)!];
    return (
      <>
        <Polyline
          coordinates={leg.geometry.map(toMap)}
          strokeColor={color}
          strokeWidth={7}
          zIndex={3}
        />
        {ends.map((p, i) => (
          <Marker
            key={`${id}-stop${i}`}
            coordinate={toMap(p)}
            anchor={{ x: 0.5, y: 0.5 }}
            title={i === 0 ? `Board: ${leg.from_name ?? ''}` : `Get off: ${leg.to_name ?? ''}`}
            tracksViewChanges={false}
            zIndex={4}
          >
            <View style={[styles.stop, { borderColor: color, backgroundColor: t.background }]} />
          </Marker>
        ))}
      </>
    );
  }
  return (
    <Polyline
      coordinates={leg.geometry.map(toMap)}
      strokeColor={t.primary}
      strokeWidth={6}
      zIndex={3}
    />
  );
}

const styles = StyleSheet.create({
  stop: { width: 14, height: 14, borderRadius: 7, borderWidth: 3 },
});

export function TripLine({
  option,
  selected,
  onPress,
}: {
  option: TripOption;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useAppTheme();
  if (!selected) {
    return (
      <>
        {option.legs.map((leg, i) => (
          <Polyline
            key={`${option.id}-${i}`}
            coordinates={leg.geometry.map(toMap)}
            strokeColor={t.routeStandard}
            strokeWidth={4}
            zIndex={2}
            tappable
            onPress={onPress}
          />
        ))}
      </>
    );
  }
  return (
    <>
      {option.legs.map((leg, i) => (
        <LegLines key={`${option.id}-${i}`} leg={leg} id={`${option.id}-${i}`} />
      ))}
    </>
  );
}
