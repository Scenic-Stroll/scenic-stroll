import { Pressable, StyleSheet, Text } from 'react-native';

import { radius, shadow, TAP_TARGET, type, useAppTheme } from '@/theme';

import { Icon, type IconName } from './icon';

/** Round button floating over the map (zoom, my location, layers, 3D…). */
export function FloatingMapButton({
  icon,
  label,
  accessibilityLabel,
  onPress,
  active = false,
}: {
  icon?: IconName;
  /** Short text instead of an icon, e.g. "3D" or "L2". */
  label?: string;
  accessibilityLabel: string;
  onPress: () => void;
  active?: boolean;
}) {
  const t = useAppTheme();
  const fg = active ? t.onPrimary : t.textPrimary;
  const bg = (pressed: boolean) =>
    active ? (pressed ? t.primaryPressed : t.primary) : pressed ? t.surfacePressed : t.background;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.button, shadow, { backgroundColor: bg(pressed) }]}
    >
      {icon ? <Icon name={icon} size={22} color={fg} /> : null}
      {label ? <Text style={[type.small, styles.label, { color: fg }]}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: TAP_TARGET + 4,
    height: TAP_TARGET + 4,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontWeight: '700' },
});
