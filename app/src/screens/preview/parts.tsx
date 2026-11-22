// Shared bits of the preview mock-ups (pins phase 7, D57): clickable screens with MADE-UP data and
// no backend, for demos and user tests. Nothing here reads or saves real data.
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { radius, space, type, useAppTheme } from '@/theme';

export function PreviewPage({ children }: { children: ReactNode }) {
  const t = useAppTheme();
  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.page}>
      <View
        accessibilityRole="alert"
        style={[styles.banner, { backgroundColor: t.warningSurface, borderColor: t.warning }]}
      >
        <Icon name="eye-outline" size={18} color={t.textPrimary} />
        <Text style={[type.small, styles.bold, styles.flex, { color: t.textPrimary }]}>
          Preview — made-up data, nothing is saved
        </Text>
      </View>
      {children}
    </ScrollView>
  );
}

export function Card({ children }: { children: ReactNode }) {
  const t = useAppTheme();
  return <View style={[styles.card, { backgroundColor: t.surface }]}>{children}</View>;
}

export function ProgressBar({ value }: { value: number }) {
  const t = useAppTheme();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      style={[styles.track, { backgroundColor: t.border }]}
    >
      <View
        style={[styles.fill, { width: `${Math.round(value * 100)}%`, backgroundColor: t.accent }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.md, maxWidth: 720, width: '100%', alignSelf: 'center' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  bold: { fontWeight: '700' },
  flex: { flex: 1 },
  card: { padding: space.lg, borderRadius: radius.md, gap: space.sm },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8 },
});
