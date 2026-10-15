/**
 * Floor buttons shown while you're zoomed into Festival Walk or a CityU building.
 * Floors come from community checkpoints; with none recorded yet it says so instead.
 */
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { FloatingMapButton } from '@/components/ui/floating-map-button';
import { radius, shadow, space, type, useAppTheme } from '@/theme';

export function FloorSelector({
  buildingName,
  floors,
  selected,
  onSelect,
  loading,
}: {
  buildingName: string;
  floors: string[];
  /** null = all floors */
  selected: string | null;
  onSelect: (floor: string | null) => void;
  loading: boolean;
}) {
  const t = useAppTheme();

  if (!loading && floors.length === 0) {
    return (
      <View
        style={[styles.note, shadow, { backgroundColor: t.background }]}
        accessible
        accessibilityLabel={`${buildingName}: no floor info yet`}
      >
        <Text style={[type.caption, { color: t.textSecondary }]} numberOfLines={2}>
          No floor info{'\n'}here yet
        </Text>
      </View>
    );
  }

  // Highest floor at the top, like a lift panel.
  const topDown = [...floors].reverse();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={`Floors in ${buildingName}`}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.stack}
        showsVerticalScrollIndicator={false}
      >
        {topDown.map((floor) => (
          <FloatingMapButton
            key={floor}
            label={floor}
            accessibilityLabel={`Floor ${floor}`}
            active={selected === floor}
            onPress={() => onSelect(selected === floor ? null : floor)}
          />
        ))}
        <FloatingMapButton
          label="All"
          accessibilityLabel="All floors"
          active={selected === null}
          onPress={() => onSelect(null)}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 290 },
  stack: { gap: space.sm, alignItems: 'flex-end', paddingVertical: 2 },
  note: {
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    maxWidth: 96,
  },
});
