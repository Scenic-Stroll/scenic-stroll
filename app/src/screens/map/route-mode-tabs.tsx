/**
 * What the routes should prefer: Best now (from the weather) · Fastest · Shaded · Sheltered · Cool ·
 * Step-free. Six choices don't fit in one row on a phone, so they are chips you can scroll sideways.
 */
import { PROFILE_FOR_CONDITION, type ConditionMode, type RoutingProfile } from '@scenic/shared';
import { ScrollView, StyleSheet } from 'react-native';

import { Chip } from '@/components/ui/chip';
import type { IconName } from '@/components/ui/icon';
import { space } from '@/theme';

export const ROUTE_MODES = [
  { key: 'best_now', label: 'Best now', icon: 'star-four-points-outline' },
  { key: 'fastest', label: 'Fastest', icon: 'lightning-bolt-outline' },
  { key: 'shaded', label: 'Shaded', icon: 'weather-sunny-off' },
  { key: 'sheltered', label: 'Sheltered', icon: 'umbrella-outline' },
  { key: 'cool', label: 'Cool', icon: 'snowflake' },
  { key: 'step_free', label: 'Step-free', icon: 'wheelchair-accessibility' },
] as const satisfies readonly { key: string; label: string; icon: IconName }[];
export type RouteMode = (typeof ROUTE_MODES)[number]['key'];

/** The routing profile a tab asks for: "Best now" follows the weather (rain → sheltered…). */
export function profileForMode(mode: RouteMode, condition: ConditionMode): RoutingProfile {
  return mode === 'best_now' ? PROFILE_FOR_CONDITION[condition] : mode;
}

export function RouteModeTabs({
  value,
  onChange,
}: {
  value: RouteMode;
  onChange: (mode: RouteMode) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="tablist"
    >
      {ROUTE_MODES.map((m) => (
        <Chip
          key={m.key}
          icon={m.icon}
          label={m.label}
          selected={m.key === value}
          onPress={() => onChange(m.key)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.sm, paddingVertical: 2 },
});
