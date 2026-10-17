/**
 * How to travel: Walk · All · Transit · Car, each with its best time ("🚶 13 · 🚇 9 · 🚗 6").
 * Walk is the default and comes first: the other modes are there to compare with walking, never
 * to replace it (a taxi tab comes in a later step).
 */
import { formatDuration, type TripOption } from '@scenic/shared';
import { ScrollView, StyleSheet } from 'react-native';

import { Chip } from '@/components/ui/chip';
import type { IconName } from '@/components/ui/icon';
import { space } from '@/theme';

export const TRAVEL_MODES = [
  { key: 'walk', label: 'Walk', icon: 'walk' },
  { key: 'all', label: 'All', icon: 'compare-horizontal' },
  { key: 'transit', label: 'Transit', icon: 'train' },
  { key: 'car', label: 'Car', icon: 'car' },
] as const satisfies readonly { key: string; label: string; icon: IconName }[];
export type TravelMode = (typeof TRAVEL_MODES)[number]['key'];

/** The quickest time for each mode, for the tab labels. */
function bestTimes(options: TripOption[]) {
  const best = (mode: TripOption['mode']) =>
    Math.min(...options.filter((o) => o.mode === mode).map((o) => o.total_s));
  return {
    walk: best('walk'),
    transit: best('transit'),
    car: best('car'),
    all: Math.min(best('walk'), best('transit'), best('car')),
  };
}

export function TravelModeTabs({
  value,
  onChange,
  options,
}: {
  value: TravelMode;
  onChange: (mode: TravelMode) => void;
  /** Trip options from plan-trip (empty while loading or unavailable). */
  options: TripOption[];
}) {
  const times = bestTimes(options);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="tablist"
    >
      {TRAVEL_MODES.map((m) => {
        const t = times[m.key];
        return (
          <Chip
            key={m.key}
            icon={m.icon}
            label={Number.isFinite(t) ? `${m.label} · ${formatDuration(t)}` : m.label}
            selected={value === m.key}
            onPress={() => onChange(m.key)}
          />
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.sm },
});
