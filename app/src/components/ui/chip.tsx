import { Pressable, StyleSheet, Text } from 'react-native';

import { radius, space, type, useAppTheme } from '@/theme';

import { Icon, type IconName } from './icon';

/** Rounded filter / tag chip. Selected = filled green. Without onPress it's a static tag. */
export function Chip({
  label,
  selected = false,
  onPress,
  icon,
  small = false,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  small?: boolean;
}) {
  const t = useAppTheme();
  const fg = selected ? t.onPrimary : t.textPrimary;
  const bg = (pressed: boolean) =>
    selected ? (pressed ? t.primaryPressed : t.primary) : pressed ? t.surfacePressed : t.surface;

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={onPress ? { selected } : undefined}
      accessibilityLabel={label}
      disabled={!onPress}
      onPress={onPress}
      // Chips are shorter than 44 pt to fit in a row; hitSlop restores a 44 pt touch area.
      hitSlop={small ? 9 : 4}
      style={({ pressed }) => [
        styles.chip,
        small ? styles.small : styles.normal,
        { backgroundColor: bg(pressed) },
      ]}
    >
      {icon ? (
        <Icon name={icon} size={small ? 14 : 16} color={selected ? t.onPrimary : t.textSecondary} />
      ) : null}
      <Text style={[small ? type.caption : type.small, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderRadius: radius.round,
    paddingHorizontal: space.md,
  },
  normal: { minHeight: 36 },
  small: { minHeight: 26, paddingHorizontal: space.sm },
});
