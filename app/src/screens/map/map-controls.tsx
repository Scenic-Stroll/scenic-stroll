/**
 * Right-hand stack of round map buttons (zoom, my location, layers) and the Layers menu.
 */
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { FloatingMapButton } from '@/components/ui/floating-map-button';
import { ListRow } from '@/components/ui/list-row';
import { radius, space, type, useAppTheme } from '@/theme';

export type MapLayers = {
  /** Tilted camera + 3D buildings. 2D is the default. */
  threeD: boolean;
  /** Green community routes on the map. */
  communityRoutes: boolean;
  /** Landmark pins (MTR exits, Festival Walk, CityU buildings). */
  places: boolean;
};

export function MapControls({
  layers,
  onLayersChange,
  onZoomIn,
  onZoomOut,
  onMyLocation,
}: {
  layers: MapLayers;
  onLayersChange: (layers: MapLayers) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onMyLocation: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <View style={styles.stack} pointerEvents="box-none">
      <FloatingMapButton icon="plus" accessibilityLabel="Zoom in" onPress={onZoomIn} />
      <FloatingMapButton icon="minus" accessibilityLabel="Zoom out" onPress={onZoomOut} />
      <FloatingMapButton
        icon="crosshairs-gps"
        accessibilityLabel="Show my location"
        onPress={onMyLocation}
      />
      <FloatingMapButton
        icon="layers-outline"
        accessibilityLabel="Map layers"
        onPress={() => setMenuOpen(true)}
        active={layers.threeD}
      />
      <LayersMenu
        visible={menuOpen}
        layers={layers}
        onChange={onLayersChange}
        onClose={() => setMenuOpen(false)}
      />
    </View>
  );
}

function LayersMenu({
  visible,
  layers,
  onChange,
  onClose,
}: {
  visible: boolean;
  layers: MapLayers;
  onChange: (layers: MapLayers) => void;
  onClose: () => void;
}) {
  const t = useAppTheme();
  const toggle = (key: keyof MapLayers, label: string) => (
    <Switch
      value={layers[key]}
      onValueChange={(v) => onChange({ ...layers, [key]: v })}
      accessibilityLabel={label}
      trackColor={{ true: t.primary, false: t.border }}
    />
  );
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: t.overlay }]}
        onPress={onClose}
        accessibilityLabel="Close layers"
      >
        {/* Inner Pressable stops taps on the card from closing it. */}
        <Pressable style={[styles.card, { backgroundColor: t.background }]} onPress={() => {}}>
          <Text
            style={[type.title, styles.title, { color: t.textPrimary }]}
            accessibilityRole="header"
          >
            Map layers
          </Text>
          <ListRow
            icon="cube-outline"
            title="3D buildings"
            subtitle="Tilted view"
            right={toggle('threeD', '3D buildings')}
          />
          <ListRow
            icon="map-marker-path"
            title="Community routes"
            subtitle="Routes recorded by walkers"
            right={toggle('communityRoutes', 'Community routes')}
          />
          <ListRow
            icon="map-marker-multiple-outline"
            title="Places"
            subtitle="MTR exits, Festival Walk, CityU buildings"
            right={toggle('places', 'Places')}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.sm, alignItems: 'flex-end' },
  backdrop: { flex: 1, justifyContent: 'center', padding: space.xl },
  card: { borderRadius: radius.sheet, paddingVertical: space.md },
  title: { paddingHorizontal: space.lg, paddingBottom: space.sm },
});
