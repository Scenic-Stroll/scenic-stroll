import type { Badge } from '@scenic/shared';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { radius, space, type, useAppTheme } from '@/theme';

/** A badge: green when earned, grey when locked. Tap to see how to earn it. */
export function BadgeTile({ badge }: { badge: Badge }) {
  const t = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${badge.name} badge, ${badge.earned ? 'earned' : 'locked'}`}
      accessibilityHint="Shows how to earn this badge"
      onPress={() =>
        Alert.alert(
          `${badge.name} · ${badge.zh}`,
          badge.earned ? `Earned! ${badge.howToEarn}` : `Locked. ${badge.howToEarn}`,
        )
      }
      style={styles.tile}
    >
      <View
        style={[
          styles.circle,
          {
            backgroundColor: badge.earned ? t.primary : t.surface,
            borderColor: badge.earned ? t.primary : t.border,
          },
        ]}
      >
        <Icon
          name={badge.icon as IconName}
          size={28}
          color={badge.earned ? t.onPrimary : t.textSecondary}
        />
        {!badge.earned ? (
          <View style={[styles.lock, { backgroundColor: t.background }]}>
            <Icon name="lock" size={12} color={t.textSecondary} />
          </View>
        ) : null}
      </View>
      <Text
        style={[
          type.caption,
          styles.name,
          { color: badge.earned ? t.textPrimary : t.textSecondary },
        ]}
        numberOfLines={2}
      >
        {badge.name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { width: 84, alignItems: 'center', gap: space.xs },
  circle: {
    width: 60,
    height: 60,
    borderRadius: radius.round,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lock: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { textAlign: 'center' },
});
