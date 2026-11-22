// My collection (centre tab, D54): the pins saved while walking, unread first. Reading happens here,
// later — never on screen while walking.
import { formatHkTime } from '@scenic/shared';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { sortedCollection, useCollection, type CollectedPin } from '@/lib/pin-collection';
import { useAuth } from '@/providers/auth-provider';
import { radius, space, type, useAppTheme } from '@/theme';

const dayFormat = new Intl.DateTimeFormat('en-HK', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Asia/Hong_Kong',
});

export function CollectionScreen() {
  const t = useAppTheme();
  const auth = useAuth();
  const { userId, pins } = useCollection();
  const mine =
    auth.status === 'signed-in' && userId === auth.session.user.id ? sortedCollection(pins) : [];
  const unread = mine.filter((p) => !p.readAt).length;

  return (
    <SafeAreaView edges={['top']} style={[styles.fill, { backgroundColor: t.background }]}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[type.heading, { color: t.textPrimary }]}>
          My collection
        </Text>
        {mine.length > 0 ? (
          <Text style={[type.small, { color: t.textSecondary }]}>
            {mine.length} saved · {unread} unread
          </Text>
        ) : null}
      </View>
      <FlatList
        data={mine}
        keyExtractor={(p) => p.pinId}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <Row pin={item} />}
        ListEmptyComponent={
          <EmptyState
            icon="bookmark-multiple-outline"
            title="Nothing saved yet"
            body="Pins are short, checked notes about places. Walk past one (with directions or while recording) and it’s saved here to read later."
          />
        }
      />
    </SafeAreaView>
  );
}

function Row({ pin }: { pin: CollectedPin }) {
  const t = useAppTheme();
  const when = new Date(pin.collectedAt);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${pin.title}, ${pin.readAt ? 'read' : 'unread'}, saved ${dayFormat.format(when)} ${formatHkTime(when)}`}
      onPress={() => router.push({ pathname: '/pin/[id]', params: { id: pin.pinId } })}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? t.surfacePressed : t.surface },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: pin.readAt ? 'transparent' : t.accent }]} />
      <View style={styles.flex}>
        <Text
          style={[type.body, { color: t.textPrimary, fontWeight: pin.readAt ? '400' : '700' }]}
          numberOfLines={2}
        >
          {pin.title}
        </Text>
        <Text style={[type.small, { color: t.textSecondary }]}>
          Saved {dayFormat.format(when)}, {formatHkTime(when)}
          {pin.readAt ? ' · Read' : ''}
        </Text>
      </View>
      <Icon name="chevron-right" size={20} color={t.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.xs },
  list: { padding: space.lg, gap: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  flex: { flex: 1, gap: 2 },
});
