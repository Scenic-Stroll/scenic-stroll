import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, space, TAP_TARGET, type, useAppTheme } from '@/theme';

import { Icon, type IconName } from './icon';

/** Settings-style row: icon · title / subtitle · right element or chevron. */
export function ListRow({
  icon,
  title,
  subtitle,
  right,
  onPress,
  danger = false,
  accessibilityHint,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  /** e.g. a <Switch>, a value label or a badge. Replaces the chevron. */
  right?: ReactNode;
  onPress?: () => void;
  danger?: boolean;
  accessibilityHint?: string;
}) {
  const t = useAppTheme();
  const titleColor = danger ? t.danger : t.textPrimary;

  const body = (
    <>
      {icon ? (
        <View style={[styles.iconBox, { backgroundColor: t.surface }]}>
          <Icon name={icon} size={20} color={danger ? t.danger : t.textPrimary} />
        </View>
      ) : null}
      <View style={styles.text}>
        <Text style={[type.body, { color: titleColor }]}>{title}</Text>
        {subtitle ? <Text style={[type.small, { color: t.textSecondary }]}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron-right" size={22} color={t.textSecondary} /> : null)}
    </>
  );

  if (!onPress) {
    return (
      <View
        style={styles.row}
        accessible
        accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      >
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: t.surface }]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: Math.max(TAP_TARGET, 56),
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
});
