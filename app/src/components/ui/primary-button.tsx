import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { radius, space, TAP_TARGET, type, useAppTheme } from '@/theme';

import { Icon, type IconName } from './icon';

type Variant = 'primary' | 'secondary' | 'danger' | 'destructive';

/**
 * Full-width rounded button. `secondary` = grey surface, `danger` = red text on grey,
 * `destructive` = filled red (Start/Stop recording).
 */
export function PrimaryButton({
  label,
  onPress,
  icon,
  variant = 'primary',
  disabled = false,
  loading = false,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
}) {
  const t = useAppTheme();
  const bg = variant === 'primary' ? t.primary : variant === 'destructive' ? t.danger : t.surface;
  const bgPressed =
    variant === 'primary'
      ? t.primaryPressed
      : variant === 'destructive'
        ? t.danger
        : t.surfacePressed;
  const fg =
    variant === 'primary'
      ? t.onPrimary
      : variant === 'destructive'
        ? t.onDanger
        : variant === 'danger'
          ? t.danger
          : t.textPrimary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: pressed ? bgPressed : bg },
        (disabled || loading) && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={20} color={fg} /> : null}
          <Text style={[styles.label, { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: Math.max(TAP_TARGET, 52),
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  label: { ...type.body, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
