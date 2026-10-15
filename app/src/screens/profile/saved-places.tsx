/** Profile → Saved places: places saved from a place card on the map (stored on this phone). */
import { PRESETS } from '@scenic/shared';
import { FlatList, Pressable, StyleSheet } from 'react-native';

import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { ListRow } from '@/components/ui/list-row';
import { useSavedPlaces } from '@/lib/saved-places-store';
import { space, TAP_TARGET, useAppTheme } from '@/theme';

export function SavedPlacesScreen() {
  const t = useAppTheme();
  const places = useSavedPlaces((s) => s.places);
  const toggle = useSavedPlaces((s) => s.toggle);

  return (
    <FlatList
      style={{ backgroundColor: t.background }}
      contentContainerStyle={styles.content}
      data={places}
      keyExtractor={(p) => p.id}
      ListEmptyComponent={
        <EmptyState
          icon="bookmark-outline"
          title="No saved places yet"
          body="Tap a place on the map and press Save to keep it here."
        />
      }
      renderItem={({ item }) => {
        const preset = item.presetId ? PRESETS.find((p) => p.id === item.presetId) : undefined;
        return (
          <ListRow
            icon="bookmark"
            title={item.label}
            subtitle={preset?.zh ?? `${item.point.lat.toFixed(5)}, ${item.point.lng.toFixed(5)}`}
            right={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item.label}`}
                onPress={() => toggle(item)}
                style={styles.remove}
              >
                <Icon name="delete-outline" size={22} color={t.textSecondary} />
              </Pressable>
            }
          />
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: space.md, flexGrow: 1 },
  remove: { width: TAP_TARGET, height: TAP_TARGET, alignItems: 'center', justifyContent: 'center' },
});
