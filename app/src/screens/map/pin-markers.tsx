// Live knowledge pins on the map (web and phones, D54). Small round markers: filled green = in
// your collection, white with a green ring = not yet. Grouped into a numbered bubble when zoomed
// out (shared/src/cluster.ts); tapping a bubble zooms in.
import { clusterMarkers, zoomFromLongitudeDelta, type MapPin } from '@scenic/shared';
import { StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';

import { Icon } from '@/components/ui/icon';
import { useCollection } from '@/lib/pin-collection';
import { type, useAppTheme } from '@/theme';

export function PinMarkers({
  pins,
  longitudeDelta,
  onPressPin,
  onPressCluster,
}: {
  pins: MapPin[];
  /** Visible width of the map in degrees (from onRegionChangeComplete), for clustering. */
  longitudeDelta: number;
  onPressPin: (pin: MapPin) => void;
  onPressCluster: (center: { lat: number; lng: number }) => void;
}) {
  const t = useAppTheme();
  const collected = useCollection((s) => s.pins);
  const groups = clusterMarkers(pins, zoomFromLongitudeDelta(longitudeDelta));

  return groups.map((g) => {
    if (g.kind === 'cluster') {
      return (
        <Marker
          key={g.id}
          coordinate={{ latitude: g.lat, longitude: g.lng }}
          accessibilityLabel={`${g.items.length} pins here — zoom in`}
          tracksViewChanges={false}
          onPress={() => onPressCluster({ lat: g.lat, lng: g.lng })}
        >
          <View style={[styles.cluster, { backgroundColor: t.accent, borderColor: t.background }]}>
            <Text style={[type.caption, styles.count]}>{g.items.length}</Text>
          </View>
        </Marker>
      );
    }
    const pin = g.item;
    const mine = !!collected[pin.id];
    return (
      <Marker
        key={pin.id}
        coordinate={{ latitude: pin.lat, longitude: pin.lng }}
        accessibilityLabel={`Pin: ${pin.title}${mine ? ', in your collection' : ''}`}
        tracksViewChanges={false}
        onPress={() => onPressPin(pin)}
      >
        <View
          style={[
            styles.pin,
            mine
              ? { backgroundColor: t.accent, borderColor: t.background }
              : { backgroundColor: t.background, borderColor: t.accent },
          ]}
        >
          <Icon
            name={mine ? 'bookmark-check' : 'lightbulb-on-outline'}
            size={16}
            color={mine ? '#FFFFFF' : t.accent}
          />
        </View>
      </Marker>
    );
  });
}

const styles = StyleSheet.create({
  pin: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cluster: {
    minWidth: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  count: { color: '#FFFFFF', fontWeight: '700' },
});
