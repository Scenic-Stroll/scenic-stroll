import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { radius, useAppTheme } from '@/theme';

import { Icon } from './icon';

/** Initials from "Karim Lee" → "KL"; works for Chinese names too ("陳大文" → "陳"). */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return Array.from(parts[0]!)[0]!.toUpperCase();
  return (Array.from(parts[0]!)[0]! + Array.from(parts.at(-1)!)[0]!).toUpperCase();
}

/** Round avatar: photo if available, otherwise initials, otherwise a walker icon (anonymous). */
export function Avatar({
  name,
  uri,
  size = 40,
}: {
  name?: string | null;
  uri?: string | null;
  size?: number;
}) {
  const t = useAppTheme();
  const box = { width: size, height: size, borderRadius: radius.round };
  const initials = name ? initialsOf(name) : '';

  if (uri) {
    return <Image source={{ uri }} style={box} accessibilityLabel={name ?? 'Profile photo'} />;
  }
  return (
    <View
      style={[styles.center, box, { backgroundColor: initials ? t.primary : t.surface }]}
      accessible
      accessibilityLabel={name ?? 'Anonymous walker'}
    >
      {initials ? (
        <Text style={{ color: t.onPrimary, fontSize: size * 0.4, fontWeight: '600' }}>
          {initials}
        </Text>
      ) : (
        <Icon name="walk" size={size * 0.55} color={t.textSecondary} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
