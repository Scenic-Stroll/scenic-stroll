import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { radius, shadow, space, TAP_TARGET, type, useAppTheme } from '@/theme';

import { Icon } from './icon';

/**
 * Rounded search field. Two modes:
 *  - `onPress` → acts as a button (on the map it opens the place picker)
 *  - `onChangeText` → a real text input
 * `right` is an optional element on the right edge (e.g. the profile avatar).
 */
export function SearchBar({
  placeholder,
  value,
  onChangeText,
  onSubmit,
  onPress,
  right,
  floating = false,
  autoFocus = false,
}: {
  placeholder: string;
  value?: string;
  onChangeText?: (text: string) => void;
  onSubmit?: () => void;
  onPress?: () => void;
  right?: ReactNode;
  floating?: boolean;
  autoFocus?: boolean;
}) {
  const t = useAppTheme();
  const container = [
    styles.bar,
    { backgroundColor: floating ? t.background : t.surface },
    floating ? shadow : null,
  ];

  const field = onChangeText ? (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      onSubmitEditing={onSubmit}
      placeholder={placeholder}
      placeholderTextColor={t.textSecondary}
      returnKeyType="search"
      autoFocus={autoFocus}
      accessibilityLabel={placeholder}
      style={[styles.input, type.body, { color: t.textPrimary }]}
    />
  ) : (
    <Text
      style={[styles.input, type.body, { color: value ? t.textPrimary : t.textSecondary }]}
      numberOfLines={1}
    >
      {value || placeholder}
    </Text>
  );

  return (
    <View style={container}>
      {onPress ? (
        // Only the search part is the button, so a `right` button (avatar) stays separately tappable.
        <Pressable
          accessibilityRole="search"
          accessibilityLabel={placeholder}
          onPress={onPress}
          style={styles.pressArea}
        >
          <Icon name="magnify" size={22} color={t.textSecondary} />
          {field}
        </Pressable>
      ) : (
        <View style={styles.pressArea}>
          <Icon name="magnify" size={22} color={t.textSecondary} />
          {field}
        </View>
      )}
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: Math.max(TAP_TARGET, 48),
    borderRadius: radius.md,
    paddingLeft: space.md,
    paddingRight: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pressArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: TAP_TARGET,
  },
  input: { flex: 1, paddingVertical: space.sm },
  right: { marginLeft: space.sm },
});
