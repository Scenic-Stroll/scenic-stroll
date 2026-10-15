/**
 * A friend's public profile: name, level, points, routes. Only visible while you're friends.
 * "Show on map" / "Route to friend" need live location sharing (step 6) — they say so.
 */
import { levelFor } from '@scenic/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { ErrorCard } from '@/components/ui/error-card';
import { ListRow } from '@/components/ui/list-row';
import { PrimaryButton } from '@/components/ui/primary-button';
import { StatTile } from '@/components/ui/stat-tile';
import { blockUser, removeFriend, useFriendProfile } from '@/lib/friends';
import { radius, space, type, useAppTheme } from '@/theme';

export function FriendProfileScreen({ friendId }: { friendId: string }) {
  const t = useAppTheme();
  const profile = useFriendProfile(friendId);
  const [busy, setBusy] = useState(false);

  const confirm = (title: string, body: string, action: () => Promise<void>, verb: string) =>
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: verb,
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await action();
            router.back();
          } catch (e) {
            Alert.alert(
              `Couldn’t ${verb.toLowerCase()}`,
              e instanceof Error ? e.message : String(e),
            );
          } finally {
            setBusy(false);
          }
        },
      },
    ]);

  if (profile.isPending) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <ActivityIndicator />
      </View>
    );
  }
  if (profile.error || !profile.data) {
    return (
      <View style={[styles.center, { backgroundColor: t.background, padding: space.lg }]}>
        <ErrorCard
          title="Couldn’t load this profile"
          message={profile.error?.message ?? 'Not found'}
          onRetry={() => void profile.refetch()}
        />
      </View>
    );
  }

  const p = profile.data;
  const level = levelFor(p.points_total);
  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Avatar name={p.name} size={80} />
        <Text style={[type.heading, { color: t.textPrimary }]}>{p.name}</Text>
        <Text style={[type.small, { color: t.textSecondary }]}>
          Level {level.number} · {level.name}
          {p.friends_since
            ? ` · friends since ${new Date(p.friends_since).toLocaleDateString()}`
            : ''}
        </Text>
      </View>

      <View style={styles.grid}>
        <StatTile icon="star-outline" label="Points" value={String(p.points_total)} />
        <StatTile icon="map-marker-path" label="Routes logged" value={String(p.routes_total)} />
      </View>

      <View style={[styles.section, { borderColor: t.border }]}>
        <ListRow
          icon="eye-outline"
          title="Public routes"
          subtitle={`${p.public_routes} with their name shown — see them under Activity`}
        />
        <ListRow
          icon="map-marker-account-outline"
          title="Show on map"
          subtitle="Needs live location sharing (coming soon)"
        />
        <ListRow
          icon="directions"
          title="Route to friend"
          subtitle="Needs live location sharing (coming soon)"
        />
      </View>

      <PrimaryButton
        label="Remove friend"
        icon="account-remove-outline"
        variant="secondary"
        disabled={busy}
        onPress={() =>
          confirm(
            'Remove friend?',
            `You and ${p.name} will no longer see each other’s points or activity.`,
            () => removeFriend(friendId),
            'Remove',
          )
        }
      />
      <PrimaryButton
        label="Block"
        icon="block-helper"
        variant="danger"
        disabled={busy}
        onPress={() =>
          confirm(
            'Block this walker?',
            `${p.name} won’t be able to send you requests. They won’t be told.`,
            () => blockUser(friendId),
            'Block',
          )
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'stretch' },
  content: { padding: space.lg, gap: space.lg },
  header: { alignItems: 'center', gap: space.xs, paddingVertical: space.lg },
  grid: { flexDirection: 'row', gap: space.sm },
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
  },
});
