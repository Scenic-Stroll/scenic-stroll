import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, space, TAP_TARGET, type, useAppTheme } from '@/theme';

/** Pill-shaped switch between 2–4 views ("My routes · Saved · Explore"). */
export function SegmentedTabs<K extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
}) {
  const t = useAppTheme();
  return (
    <View style={[styles.track, { backgroundColor: t.surface }]} accessibilityRole="tablist">
      {options.map((o) => {
        const selected = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.key)}
            style={[styles.tab, selected && [styles.selected, { backgroundColor: t.background }]]}
          >
            <Text
              style={[
                type.small,
                {
                  color: selected ? t.textPrimary : t.textSecondary,
                  fontWeight: selected ? '600' : '400',
                },
              ]}
              numberOfLines={1}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: radius.md, padding: 3 },
  tab: {
    flex: 1,
    minHeight: TAP_TARGET - 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md - 2,
    paddingHorizontal: space.sm,
  },
  selected: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
});
