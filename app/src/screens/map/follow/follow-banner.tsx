/**
 * The message at the top of the follow panel: "You left the route — here's a new one", or the
 * weather offer "It's started raining — a sheltered route via Festival Walk adds 2 min. Switch?".
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import type { FollowBanner as Banner } from '@/lib/follow-store';
import { radius, space, TAP_TARGET, type, useAppTheme } from '@/theme';

export function FollowBanner({
  banner,
  onSwitch,
  onUndo,
  onDismiss,
}: {
  banner: Banner;
  onSwitch: () => void;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const t = useAppTheme();
  const isWeather = banner.kind === 'weather';
  const canSwitch = banner.kind === 'weather' && banner.candidate !== null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.box, { backgroundColor: isWeather ? t.warningSurface : t.infoSurface }]}
    >
      <View style={styles.row}>
        <Icon
          name={isWeather ? 'weather-cloudy-alert' : 'information-outline'}
          size={20}
          color={isWeather ? t.warning : t.textPrimary}
        />
        <Text style={[type.small, styles.flex1, { color: t.textPrimary }]}>{banner.text}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss message"
          onPress={onDismiss}
          hitSlop={10}
        >
          <Icon name="close" size={18} color={t.textSecondary} />
        </Pressable>
      </View>
      {canSwitch || (banner.kind === 'notice' && banner.undo) ? (
        <View style={styles.buttons}>
          {canSwitch ? (
            <>
              <BannerButton label="Switch" strong onPress={onSwitch} />
              <BannerButton label="Keep my route" onPress={onDismiss} />
            </>
          ) : (
            <BannerButton label="Undo report" onPress={onUndo} />
          )}
        </View>
      ) : null}
    </View>
  );
}

function BannerButton({
  label,
  strong = false,
  onPress,
}: {
  label: string;
  strong?: boolean;
  onPress: () => void;
}) {
  const t = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.button, { backgroundColor: strong ? t.primary : t.background }]}
    >
      <Text style={[type.small, styles.bold, { color: strong ? t.onPrimary : t.textPrimary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.md, padding: space.md, gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  flex1: { flex: 1 },
  buttons: { flexDirection: 'row', gap: space.sm, marginLeft: 28 },
  button: {
    minHeight: TAP_TARGET,
    paddingHorizontal: space.lg,
    borderRadius: radius.round,
    justifyContent: 'center',
  },
  bold: { fontWeight: '700' },
});
