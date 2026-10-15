/**
 * Horizontal strip of what a route is made of, in order: 🚶 outdoor › 🏢 indoor › 🛗 lift › …
 * Built by buildSegments() in /shared from the route's checkpoints.
 */
import { SEGMENT_INFO, type SegmentKind } from '@scenic/shared';
import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { radius, space, type, useAppTheme } from '@/theme';

export function SegmentStrip({ segments }: { segments: readonly SegmentKind[] }) {
  const t = useAppTheme();
  const spoken = segments.map((s) => SEGMENT_INFO[s].en).join(', then ');
  return (
    <View style={styles.row} accessible accessibilityLabel={`Route: ${spoken}`}>
      {segments.map((s, i) => (
        <View key={`${s}-${i}`} style={styles.item}>
          {i > 0 ? <Icon name="chevron-right" size={16} color={t.textSecondary} /> : null}
          <View style={[styles.pill, { backgroundColor: s === 'outdoor' ? t.surface : t.primary }]}>
            <Icon
              name={SEGMENT_INFO[s].icon as IconName}
              size={16}
              color={s === 'outdoor' ? t.textPrimary : t.onPrimary}
            />
            {segments.length <= 3 ? (
              <Text
                style={[type.caption, { color: s === 'outdoor' ? t.textPrimary : t.onPrimary }]}
              >
                {SEGMENT_INFO[s].en}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: space.xs },
  item: { flexDirection: 'row', alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.round,
  },
});
