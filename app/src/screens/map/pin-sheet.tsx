// Tapping a knowledge pin on the map: its title, label, the sources it cites and "Route to this pin".
// Never the pin's text — it is read later, in My collection, not while walking (D54).
import { PIN_LABEL_TEXT, type MapPin } from '@scenic/shared';
import { router } from 'expo-router';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { PrimaryButton } from '@/components/ui/primary-button';
import { useCollection } from '@/lib/pin-collection';
import { usePinContent } from '@/lib/pins';
import { radius, space, type, useAppTheme } from '@/theme';

export function PinSheet({
  pin,
  onRoute,
  onClose,
}: {
  pin: MapPin;
  onRoute: () => void;
  onClose: () => void;
}) {
  const t = useAppTheme();
  const content = usePinContent(pin.id);
  const collected = useCollection((s) => s.pins[pin.id]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.flex1}>
          <Text accessibilityRole="header" style={[type.heading, { color: t.textPrimary }]}>
            {pin.title}
          </Text>
          <View style={styles.badges}>
            <Badge
              icon={pin.label === 'expert_verified' ? 'check-decagram' : 'robot-outline'}
              text={PIN_LABEL_TEXT[pin.label]}
            />
            {pin.is_sample ? <Badge icon="flask-outline" text="Sample" /> : null}
            {collected ? <Badge icon="bookmark-check" text="In your collection" /> : null}
          </View>
          {pin.place_description ? (
            <Text style={[type.small, { color: t.textSecondary }]}>{pin.place_description}</Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close pin"
          onPress={onClose}
          hitSlop={8}
          style={[styles.close, { backgroundColor: t.surface }]}
        >
          <Icon name="close" size={20} color={t.textPrimary} />
        </Pressable>
      </View>

      <PrimaryButton label="Route to this pin" icon="directions" onPress={onRoute} />
      {collected ? (
        <PrimaryButton
          label="Read it"
          icon="book-open-variant"
          variant="secondary"
          onPress={() => router.push({ pathname: '/pin/[id]', params: { id: pin.id } })}
        />
      ) : (
        <Text style={[type.small, { color: t.textSecondary }]}>
          Walk past it with directions or while recording to save it to My collection, then read it
          there.
        </Text>
      )}

      <Text accessibilityRole="header" style={[type.title, { color: t.textPrimary }]}>
        Sources cited
      </Text>
      {content.isLoading ? <ActivityIndicator /> : null}
      {(content.data?.sources ?? []).map((s) => (
        <Text
          key={s.url}
          accessibilityRole="link"
          onPress={() => void Linking.openURL(s.url)}
          style={[type.small, { color: t.primary }]}
        >
          {s.title}
        </Text>
      ))}
    </View>
  );
}

function Badge({ icon, text }: { icon: IconName; text: string }) {
  const t = useAppTheme();
  return (
    <View style={[styles.badge, { backgroundColor: t.surface }]}>
      <Icon name={icon} size={14} color={t.textSecondary} />
      <Text style={[type.caption, { color: t.textPrimary }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.md },
  header: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  flex1: { flex: 1, gap: space.xs },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.round,
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
