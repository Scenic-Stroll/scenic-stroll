import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { radius, space, type, useAppTheme } from '@/theme';

import { Icon, type IconName } from './icon';

/** Friendly "nothing here yet" block with an optional action button. */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  const t = useAppTheme();
  return (
    <View style={styles.box} accessible accessibilityLabel={body ? `${title}. ${body}` : title}>
      <View style={[styles.iconCircle, { backgroundColor: t.surface }]}>
        <Icon name={icon} size={32} color={t.textSecondary} />
      </View>
      <Text style={[type.title, styles.center, { color: t.textPrimary }]}>{title}</Text>
      {body ? (
        <Text style={[type.small, styles.center, { color: t.textSecondary }]}>{body}</Text>
      ) : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', padding: space.xl, gap: space.sm },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  center: { textAlign: 'center' },
  action: { alignSelf: 'stretch', marginTop: space.md },
});
