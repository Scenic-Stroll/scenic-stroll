import { StyleSheet, Text, View } from 'react-native';

import { radius, space, type, useAppTheme } from '@/theme';

import { Icon } from './icon';
import { PrimaryButton } from './primary-button';

/**
 * A problem shown inside the UI as a friendly card with a Retry button — never as a raw error.
 * `message` should already be human-readable (FunctionCallError messages are).
 */
export function ErrorCard({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  const t = useAppTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: t.surface }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.row}>
        <Icon name="alert-circle-outline" size={22} color={t.warning} />
        <View style={styles.text}>
          <Text style={[type.body, { color: t.textPrimary, fontWeight: '600' }]}>{title}</Text>
          <Text style={[type.small, { color: t.textSecondary }]}>{message}</Text>
        </View>
      </View>
      {onRetry ? (
        <PrimaryButton label="Try again" icon="refresh" variant="secondary" onPress={onRetry} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.md, padding: space.lg, gap: space.md },
  row: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  text: { flex: 1, gap: 2 },
});
