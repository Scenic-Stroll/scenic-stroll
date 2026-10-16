/**
 * The exposure bar on a computed route: how much of the walk is in the sun, in shade, under cover
 * and indoors, as one coloured bar with metres underneath. Shade is an estimate (building heights +
 * sun position), and the caption says so.
 */
import { formatDistance, type SmartRouteOption } from '@scenic/shared';
import { StyleSheet, Text, View } from 'react-native';

import { radius, space, type, useAppTheme } from '@/theme';

import { RUN_LABELS, runColor } from './route-colors';

const PARTS = ['sun', 'shade', 'covered', 'indoor', 'open'] as const;

export function ExposureBar({ exposure }: { exposure: SmartRouteOption['exposure'] }) {
  const t = useAppTheme();
  const metres: Record<(typeof PARTS)[number], number> = {
    sun: exposure.sun_m,
    shade: exposure.shade_m,
    covered: exposure.covered_m,
    indoor: exposure.indoor_m,
    open: exposure.open_m,
  };
  const total = PARTS.reduce((s, p) => s + metres[p], 0);
  if (total <= 0) return null;
  const shown = PARTS.filter((p) => metres[p] >= 5);
  const spoken = shown.map((p) => `${RUN_LABELS[p]} ${formatDistance(metres[p])}`).join(', ');

  return (
    <View accessible accessibilityLabel={`Exposure: ${spoken}`} style={styles.wrap}>
      <View style={[styles.bar, { backgroundColor: t.surface }]}>
        {shown.map((p) => (
          <View key={p} style={{ flex: metres[p], backgroundColor: runColor(p, t) }} />
        ))}
      </View>
      <View style={styles.legend}>
        {shown.map((p) => (
          <View key={p} style={styles.item}>
            <View style={[styles.dot, { backgroundColor: runColor(p, t) }]} />
            <Text style={[type.caption, { color: t.textSecondary }]}>
              {RUN_LABELS[p]} {formatDistance(metres[p])}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  bar: { flexDirection: 'row', height: 8, borderRadius: radius.round, overflow: 'hidden' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.md, rowGap: 2 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
