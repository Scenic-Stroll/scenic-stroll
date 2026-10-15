/**
 * Friends tab: Friends (with the weekly leaderboard) · Requests · Activity, and "Add friend".
 * Privacy: friends only see each other's points, public profile and routes they chose to show
 * their name on. Live location sharing comes later (step 6).
 */
import {
  agoLabel,
  levelFor,
  type ActivityRow,
  type FriendRow,
  type LeaderboardRow,
} from '@scenic/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorCard } from '@/components/ui/error-card';
import { Icon, type IconName } from '@/components/ui/icon';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import {
  removeFriend,
  respondToRequest,
  useFriendActivity,
  useFriendList,
  useLeaderboard,
} from '@/lib/friends';
import { useFriendLocations, useSharing } from '@/lib/location-sharing';
import { useMapFocus } from '@/lib/map-focus-store';
import { radius, space, TAP_TARGET, type, useAppTheme } from '@/theme';

import { AddFriendSheet } from './add-friend-sheet';
import { ShareLocationSheet } from './share-location-sheet';

const TABS = [
  { key: 'friends', label: 'Friends' },
  { key: 'requests', label: 'Requests' },
  { key: 'activity', label: 'Activity' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export function FriendsScreen() {
  const t = useAppTheme();
  const [tab, setTab] = useState<TabKey>('friends');
  const [adding, setAdding] = useState(false);
  const [sharingSheet, setSharingSheet] = useState(false);
  const sharingOn = useSharing((s) => s.status === 'on');
  const locations = useFriendLocations();
  const sharingSince = new Map((locations.data ?? []).map((l) => [l.user_id, l.updated_at]));
  const list = useFriendList();
  const leaderboard = useLeaderboard();
  const activity = useFriendActivity();

  const rows = list.data ?? [];
  const friends = rows.filter((r) => r.kind === 'friend');
  const incoming = rows.filter((r) => r.kind === 'incoming');
  const outgoing = rows.filter((r) => r.kind === 'outgoing');
  const blocked = rows.filter((r) => r.kind === 'blocked');
  const tabs = TABS.map((x) =>
    x.key === 'requests' && incoming.length ? { ...x, label: `Requests (${incoming.length})` } : x,
  );

  const refreshing = list.isFetching || leaderboard.isFetching || activity.isFetching;
  const refresh = () => {
    void list.refetch();
    void leaderboard.refetch();
    void activity.refetch();
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.fill, { backgroundColor: t.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing && !list.isPending} onRefresh={refresh} />
        }
      >
        <View style={styles.titleRow}>
          <Text
            style={[type.heading, styles.flex1, { color: t.textPrimary }]}
            accessibilityRole="header"
          >
            Friends
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add friend"
            onPress={() => setAdding(true)}
            style={({ pressed }) => [
              styles.addButton,
              { backgroundColor: pressed ? t.primaryPressed : t.primary },
            ]}
          >
            <Icon name="account-plus" size={20} color={t.onPrimary} />
            <Text style={[type.small, { color: t.onPrimary, fontWeight: '600' }]}>Add friend</Text>
          </Pressable>
        </View>

        <SegmentedTabs options={tabs} value={tab} onChange={setTab} />

        {list.isPending ? <ActivityIndicator style={styles.loading} /> : null}
        {list.error ? (
          <ErrorCard title="Couldn’t load friends" message={list.error.message} onRetry={refresh} />
        ) : null}

        {!list.isPending && !list.error && tab === 'friends' ? (
          <>
            {friends.length > 0 ? (
              <PersonRow
                name=""
                icon={sharingOn ? 'access-point' : 'map-marker-account-outline'}
                title={sharingOn ? 'You’re sharing your location' : 'Share my location'}
                subtitle={
                  sharingOn ? 'Tap to change or stop' : 'Off · choose who, how long and how precise'
                }
                onPress={() => setSharingSheet(true)}
              />
            ) : null}
            {leaderboard.data && leaderboard.data.length > 1 ? (
              <Leaderboard rows={leaderboard.data} />
            ) : null}
            {friends.length === 0 ? (
              <EmptyState
                icon="account-multiple-outline"
                title="No friends yet"
                body="Add friends with their code or QR to see their routes and compare points each week."
                action={
                  <PrimaryButton
                    label="Add friend"
                    icon="account-plus"
                    onPress={() => setAdding(true)}
                  />
                }
              />
            ) : (
              friends.map((f) => (
                <FriendRowView
                  key={f.friendship_id}
                  friend={f}
                  sharingSince={sharingSince.get(f.other_id) ?? null}
                />
              ))
            )}
            {blocked.length > 0 ? (
              <>
                <SectionTitle text="Blocked" />
                {blocked.map((b) => (
                  <PersonRow
                    key={b.friendship_id}
                    name={b.name}
                    subtitle="Blocked — they can’t send you requests"
                    right={
                      <SmallButton
                        label="Unblock"
                        onPress={() =>
                          void removeFriend(b.other_id).catch((e) =>
                            Alert.alert('Couldn’t unblock', String(e?.message ?? e)),
                          )
                        }
                      />
                    }
                  />
                ))}
              </>
            ) : null}
          </>
        ) : null}

        {!list.isPending && !list.error && tab === 'requests' ? (
          <Requests incoming={incoming} outgoing={outgoing} />
        ) : null}

        {tab === 'activity' ? (
          <Activity
            rows={activity.data}
            isLoading={activity.isPending}
            error={activity.error}
            onRetry={refresh}
          />
        ) : null}
      </ScrollView>

      <AddFriendSheet visible={adding} onClose={() => setAdding(false)} />
      <ShareLocationSheet visible={sharingSheet} onClose={() => setSharingSheet(false)} />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------------------------

function Leaderboard({ rows }: { rows: LeaderboardRow[] }) {
  const t = useAppTheme();
  return (
    <View style={[styles.card, { backgroundColor: t.surface }]}>
      <View style={styles.cardTitle}>
        <Icon name="trophy-outline" size={20} color={t.primary} />
        <Text style={[type.body, { color: t.textPrimary, fontWeight: '600' }]}>This week</Text>
      </View>
      {rows.map((r, i) => (
        <View
          key={r.user_id}
          style={styles.boardRow}
          accessible
          accessibilityLabel={`Rank ${i + 1}: ${r.is_me ? 'you' : r.name}, ${r.points_week} points this week`}
        >
          <Text style={[type.body, styles.rank, { color: i === 0 ? t.primary : t.textSecondary }]}>
            {i + 1}
          </Text>
          <Avatar name={r.name} size={28} />
          <Text
            style={[
              type.body,
              styles.flex1,
              { color: t.textPrimary, fontWeight: r.is_me ? '600' : '400' },
            ]}
            numberOfLines={1}
          >
            {r.is_me ? `${r.name} (you)` : r.name}
          </Text>
          <Text style={[type.small, { color: t.textSecondary }]}>{r.points_week} pts</Text>
        </View>
      ))}
    </View>
  );
}

function FriendRowView({
  friend,
  sharingSince,
}: {
  friend: FriendRow;
  sharingSince: string | null;
}) {
  const level = levelFor(friend.points_total ?? 0);
  const sharing = sharingSince ? `Sharing location · ${agoLabel(sharingSince)}` : 'Not sharing';
  return (
    <PersonRow
      name={friend.name}
      subtitle={`Level ${level.number} · ${level.name} · ${sharing}`}
      onPress={() => router.push({ pathname: '/friend/[id]', params: { id: friend.other_id } })}
    />
  );
}

function Requests({ incoming, outgoing }: { incoming: FriendRow[]; outgoing: FriendRow[] }) {
  const act = (fn: () => Promise<void>, failTitle: string) =>
    void fn().catch((e) => Alert.alert(failTitle, e instanceof Error ? e.message : String(e)));

  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <EmptyState
        icon="email-outline"
        title="No requests"
        body="When someone adds your code, their request appears here."
      />
    );
  }
  return (
    <>
      {incoming.length > 0 ? <SectionTitle text="Incoming" /> : null}
      {incoming.map((r) => (
        <PersonRow
          key={r.friendship_id}
          name={r.name}
          subtitle="Wants to be friends"
          right={
            <View style={styles.buttons}>
              <SmallButton
                label="Accept"
                primary
                onPress={() =>
                  act(() => respondToRequest(r.friendship_id, true), 'Couldn’t accept')
                }
              />
              <SmallButton
                label="Decline"
                onPress={() =>
                  act(() => respondToRequest(r.friendship_id, false), 'Couldn’t decline')
                }
              />
            </View>
          }
        />
      ))}
      {outgoing.length > 0 ? <SectionTitle text="Sent" /> : null}
      {outgoing.map((r) => (
        <PersonRow
          key={r.friendship_id}
          name={r.name}
          subtitle="Waiting for them to accept"
          right={
            <SmallButton
              label="Cancel"
              onPress={() => act(() => removeFriend(r.other_id), 'Couldn’t cancel')}
            />
          }
        />
      ))}
    </>
  );
}

function Activity({
  rows,
  isLoading,
  error,
  onRetry,
}: {
  rows: ActivityRow[] | undefined;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  const t = useAppTheme();
  const focusRoute = useMapFocus((s) => s.focusRoute);
  if (isLoading) return <ActivityIndicator style={styles.loading} />;
  if (error)
    return <ErrorCard title="Couldn’t load activity" message={error.message} onRetry={onRetry} />;
  if (!rows || rows.length === 0) {
    return (
      <EmptyState
        icon="history"
        title="No friend activity yet"
        body="Routes your friends log appear here — only the ones they chose to show their name on."
      />
    );
  }
  return (
    <>
      {rows.map((a) => (
        <Pressable
          key={a.route_id}
          accessibilityRole="button"
          accessibilityLabel={`${a.name} logged ${a.title}. Show on map.`}
          onPress={() => {
            focusRoute(a.route_id);
            router.navigate('/');
          }}
          style={({ pressed }) => [styles.activityRow, pressed && { backgroundColor: t.surface }]}
        >
          <Avatar name={a.name} size={40} />
          <View style={styles.flex1}>
            <Text style={[type.body, { color: t.textPrimary }]}>
              <Text style={{ fontWeight: '600' }}>{a.name}</Text> logged{' '}
              <Text style={{ fontStyle: 'italic' }}>{a.title}</Text>
            </Text>
            <View style={styles.activityMeta}>
              <Text style={[type.caption, { color: t.textSecondary }]}>
                {new Date(a.created_at).toLocaleDateString()}
              </Text>
              {a.status === 'verified' ? (
                <Chip small icon="check-decagram" label="Verified" />
              ) : null}
            </View>
          </View>
          <Icon name="map-outline" size={20} color={t.textSecondary} />
        </Pressable>
      ))}
    </>
  );
}

// ---- small building blocks -------------------------------------------------------------------

function PersonRow({
  name,
  subtitle,
  right,
  onPress,
  icon,
  title,
}: {
  name: string;
  subtitle: string;
  right?: React.ReactNode;
  onPress?: () => void;
  /** Show an icon instead of an avatar (for non-person rows like "Share my location"). */
  icon?: IconName;
  /** Overrides `name` as the row title. */
  title?: string;
}) {
  const t = useAppTheme();
  const label = title ?? name;
  const content = (
    <>
      {icon ? (
        <View style={[styles.iconCircle, { backgroundColor: t.surface }]}>
          <Icon name={icon} size={22} color={t.primary} />
        </View>
      ) : (
        <Avatar name={name} size={44} />
      )}
      <View style={styles.flex1}>
        <Text style={[type.body, { color: t.textPrimary, fontWeight: '600' }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[type.small, { color: t.textSecondary }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {right ?? (onPress ? <Icon name="chevron-right" size={22} color={t.textSecondary} /> : null)}
    </>
  );
  if (!onPress) return <View style={styles.person}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${subtitle}`}
      onPress={onPress}
      style={({ pressed }) => [styles.person, pressed && { backgroundColor: t.surface }]}
    >
      {content}
    </Pressable>
  );
}

function SmallButton({
  label,
  onPress,
  primary = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  const t = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.smallButton,
        {
          backgroundColor: primary
            ? pressed
              ? t.primaryPressed
              : t.primary
            : pressed
              ? t.surfacePressed
              : t.surface,
        },
      ]}
    >
      <Text
        style={[type.small, { color: primary ? t.onPrimary : t.textPrimary, fontWeight: '600' }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SectionTitle({ text }: { text: string }) {
  const t = useAppTheme();
  return (
    <Text
      style={[type.small, styles.sectionTitle, { color: t.textSecondary }]}
      accessibilityRole="header"
    >
      {text.toUpperCase()}
    </Text>
  );
}

const styles = StyleSheet.create({
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: { flex: 1 },
  flex1: { flex: 1 },
  content: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xxl,
    gap: space.md,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  addButton: {
    minHeight: TAP_TARGET,
    paddingHorizontal: space.md,
    borderRadius: radius.round,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  loading: { paddingVertical: space.xl },
  card: { borderRadius: radius.md, padding: space.lg, gap: space.sm },
  cardTitle: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  boardRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 36 },
  rank: { width: 20, fontWeight: '700' },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: TAP_TARGET + 16,
    borderRadius: radius.md,
    paddingHorizontal: space.xs,
  },
  buttons: { flexDirection: 'row', gap: space.xs },
  smallButton: {
    minHeight: TAP_TARGET - 8,
    paddingHorizontal: space.md,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { fontWeight: '600', marginTop: space.sm },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderRadius: radius.md,
    minHeight: TAP_TARGET + 12,
  },
  activityMeta: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 2 },
});
