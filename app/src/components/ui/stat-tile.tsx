import { StyleSheet, Text, View } from 'react-native';

import { radius, space, type, useAppTheme } from '@/theme';

import { Icon, type IconName } from './icon';

/** One number with a label, for the Profile stats grid. */
export function StatTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: IconName;
}) {
  const t = useAppTheme();
  return (
    <View
      style={[styles.tile, { backgroundColor: t.surface }]}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      {icon ? <Icon name={icon} size={20} color={t.primary} /> : null}
      <Text style={[type.heading, { color: t.textPrimary }]}>{value}</Text>
      <Text style={[type.small, { color: t.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, borderRadius: radius.md, padding: space.lg, gap: space.xs },
});
