/**
 * Profile tab: header (name, level, progress), stats, badges, then lists — your activity, privacy,
 * preferences, diagnostics and about.
 *
 * Points, stats and badges are calculated on this phone from your recordings (works offline and for
 * anonymous users). Verification-based points/badges unlock when route verification ships (Phase 5).
 */
import { badgesFor, levelFor, pointsFor, TAGS } from '@scenic/shared';
import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DiagnosticsCard } from '@/components/diagnostics-card';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { ListRow } from '@/components/ui/list-row';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { StatTile } from '@/components/ui/stat-tile';
import { getMyStats } from '@/lib/local-db';
import { deleteMyData, downloadMyData } from '@/lib/my-data';
import { useMyProfile } from '@/lib/profile';
import { localKeys } from '@/lib/query-client';
import { useSharing } from '@/lib/location-sharing';
import { useSavedPlaces } from '@/lib/saved-places-store';
import { ShareLocationSheet } from '@/screens/friends/share-location-sheet';
import { useSettings, type ThemePreference } from '@/lib/settings-store';
import { useAuth } from '@/providers/auth-provider';
import { radius, space, TAP_TARGET, type, useAppTheme } from '@/theme';

import { BadgeTile } from './badge-tile';
import { EditProfileSheet } from './edit-profile-sheet';

const THEME_OPTIONS = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
] as const satisfies readonly { key: ThemePreference; label: string }[];

export function ProfileScreen() {
  const t = useAppTheme();
  const auth = useAuth();
  const userId = auth.status === 'signed-in' ? auth.session.user.id : null;
  const isAnonymous = auth.status === 'signed-in' && auth.session.user.is_anonymous;

  const profile = useMyProfile();
  const stats = useQuery({ queryKey: localKeys.stats, queryFn: getMyStats });
  const savedCount = useSavedPlaces((s) => s.places.length);
  const settings = useSettings();

  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sharingSheet, setSharingSheet] = useState(false);
  const sharingOn = useSharing((s) => s.status === 'on');

  // Verification (Phase 5) isn't built yet, so these are honestly 0 for now.
  const routesVerified = 0;
  const verifiedWalks = 0;
  const s = stats.data;
  const points = s
    ? pointsFor({
        routes: s.routesLogged,
        descriptions: s.descriptions,
        verifiedWalks,
        routesVerified,
      })
    : 0;
  const level = levelFor(points);
  const badges = badgesFor({
    routesLogged: s?.routesLogged ?? 0,
    liftCheckpoints: s?.liftCheckpoints ?? 0,
    shelteredRoutes: s?.shelteredRoutes ?? 0,
    routesVerified,
    weeklyRank: null,
  });
  const displayName = profile.data?.displayName ?? null;

  const exportData = async () => {
    setExporting(true);
    try {
      await downloadMyData(userId);
    } catch (e) {
      Alert.alert('Couldn’t export your data', e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete all my data?',
      'This permanently deletes your uploaded routes and descriptions from the server, and every recording, GPS point and saved place on this phone. It can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteMyData(userId);
              Alert.alert('Deleted', 'Your routes, descriptions and phone data have been deleted.');
            } catch (e) {
              Alert.alert(
                'Nothing was deleted on your phone',
                `${e instanceof Error ? e.message : String(e)} Check your connection and try again.`,
              );
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.fill, { backgroundColor: t.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Avatar name={displayName} size={72} />
          <View style={styles.flex1}>
            <Text style={[type.heading, { color: t.textPrimary }]} numberOfLines={1}>
              {displayName ?? 'Anonymous walker'}
            </Text>
            <Text style={[type.small, { color: t.textSecondary }]}>
              Level {level.number} · {level.name}
              {level.pointsToNext !== null
                ? ` — ${level.pointsToNext} pts to next level`
                : ' — top level'}
            </Text>
            <View
              style={[styles.progressTrack, { backgroundColor: t.surface }]}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel="Progress to next level"
              accessibilityValue={{ min: 0, max: 100, now: Math.round(level.progress * 100) }}
            >
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.round(level.progress * 100)}%`, backgroundColor: t.primary },
                ]}
              />
            </View>
          </View>
        </View>
        <View style={styles.inset}>
          <PrimaryButton
            label="Edit profile"
            icon="pencil"
            variant="secondary"
            onPress={() => setEditing(true)}
          />
        </View>

        {auth.status === 'error' ? (
          <View style={[styles.banner, { backgroundColor: t.surface }]}>
            <Icon name="alert-circle-outline" size={22} color={t.warning} />
            <Text style={[type.small, styles.flex1, { color: t.textPrimary }]}>
              Not signed in: {auth.message}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={auth.retry}
              hitSlop={8}
              style={styles.retry}
            >
              <Text style={[type.small, { color: t.primary, fontWeight: '600' }]}>Try again</Text>
            </Pressable>
          </View>
        ) : null}
        {isAnonymous ? (
          <View style={[styles.banner, { backgroundColor: t.surface }]}>
            <Icon name="account-plus-outline" size={22} color={t.primary} />
            <Text style={[type.small, styles.flex1, { color: t.textPrimary }]}>
              Create an account to keep your points and add friends. Email accounts are coming soon
              — until then your routes and points stay with this phone.
            </Text>
          </View>
        ) : null}

        {/* Stats */}
        <View style={styles.inset}>
          {stats.isPending ? <ActivityIndicator /> : null}
          <View style={styles.grid}>
            <StatTile
              icon="map-marker-path"
              label="Routes logged"
              value={String(s?.routesLogged ?? 0)}
            />
            <StatTile
              icon="walk"
              label="Km walked"
              value={((s?.metersWalked ?? 0) / 1000).toFixed(1)}
            />
          </View>
          <View style={styles.grid}>
            <StatTile
              icon="check-decagram"
              label="Verified by others"
              value={String(routesVerified)}
            />
            <StatTile icon="star-outline" label="Points" value={String(points)} />
          </View>
          <Text style={[type.caption, { color: t.textSecondary }]}>
            Counted on this phone: +10 per uploaded route, +5 per description. Verification points
            arrive with route verification.
          </Text>
        </View>

        {/* Badges */}
        <Section title="Badges">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.badges}
          >
            {badges.map((b) => (
              <BadgeTile key={b.id} badge={b} />
            ))}
          </ScrollView>
        </Section>

        <Section title="Your activity">
          <ListRow
            icon="map-marker-path"
            title="My routes"
            subtitle={`${s?.routesLogged ?? 0} uploaded`}
            onPress={() => router.navigate('/routes')}
          />
          <ListRow
            icon="text-box-outline"
            title="My descriptions & tags"
            subtitle={`${s?.descriptions ?? 0} description${s?.descriptions === 1 ? '' : 's'} · AI tags arrive with tagging`}
          />
          <ListRow
            icon="bookmark-outline"
            title="Saved places"
            subtitle={`${savedCount} saved`}
            onPress={() => router.push('/saved-places')}
          />
          <ListRow
            icon="flag-outline"
            title="Reports I made"
            subtitle="None yet — reporting arrives with verification"
          />
        </Section>

        <Section title="Privacy">
          <ListRow
            icon="account-eye-outline"
            title="Show my name on new routes"
            subtitle={
              displayName ? `As “${displayName}”` : 'Set a display name first (Edit profile)'
            }
            right={
              <Switch
                value={settings.showNameByDefault}
                onValueChange={settings.setShowNameByDefault}
                accessibilityLabel="Show my name on new routes"
                trackColor={{ true: t.primary, false: t.border }}
              />
            }
          />
          <ListRow
            icon={sharingOn ? 'access-point' : 'map-marker-account-outline'}
            title="Location sharing"
            subtitle={
              sharingOn ? 'On — tap to change or stop' : 'Off · share live with chosen friends'
            }
            onPress={() => setSharingSheet(true)}
          />
          <ListRow
            icon="download-outline"
            title="Download my data"
            subtitle="Everything on this phone + your profile, as a JSON file"
            onPress={() => void exportData()}
            right={exporting ? <ActivityIndicator /> : undefined}
          />
          <ListRow
            icon="delete-outline"
            title="Delete my data"
            subtitle="Your routes, descriptions and everything on this phone"
            danger
            onPress={confirmDelete}
            right={deleting ? <ActivityIndicator /> : undefined}
          />
        </Section>

        <Section title="Preferences">
          <View style={styles.themeRow}>
            <Text style={[type.body, { color: t.textPrimary }]}>Theme</Text>
            <SegmentedTabs
              options={THEME_OPTIONS}
              value={settings.themePreference}
              onChange={settings.setThemePreference}
            />
          </View>
          <ListRow icon="translate" title="Language" subtitle="English · 繁體中文 coming soon" />
          <ListRow
            icon="clipboard-list-outline"
            title="Data collection mode"
            subtitle="Team walks: bigger buttons, auto-numbered titles, “Save & record another”, no 50 m trim"
            right={
              <Switch
                value={settings.dataCollectionMode}
                onValueChange={settings.setDataCollectionMode}
                accessibilityLabel="Data collection mode"
                trackColor={{ true: t.primary, false: t.border }}
              />
            }
          />
        </Section>

        <Section title="Diagnostics">
          <View style={styles.inset}>
            <DiagnosticsCard />
          </View>
        </Section>

        <Section title="About">
          <ListRow
            icon="information-outline"
            title="Version"
            right={<Value text={Constants.expoConfig?.version ?? '?'} />}
          />
          <ListRow
            icon="tag-multiple-outline"
            title="Route tags loaded"
            right={<Value text={String(TAGS.length)} />}
          />
          <ListRow
            icon="map-outline"
            title="Landmark data"
            subtitle="© OpenStreetMap contributors (ODbL)"
          />
          <ListRow
            icon="weather-partly-cloudy"
            title="Weather data"
            subtitle="© Hong Kong Observatory, HKSAR Government · via DATA.GOV.HK"
          />
          <ListRow
            icon="walk"
            title="Walking network"
            subtitle="3D Pedestrian Network © Lands Department, HKSAR Government · via CSDI / DATA.GOV.HK"
          />
          <ListRow
            icon="weather-sunny-off"
            title="Shade estimates"
            subtitle="Building heights © Lands Department, HKSAR Government · trees © OpenStreetMap contributors (ODbL)"
          />
          <ListRow
            icon="car"
            title="Driving routes"
            subtitle="Google Maps Platform (live traffic, when enabled) · openrouteservice.org, © OpenStreetMap contributors"
          />
          <ListRow
            icon="train"
            title="Public transport"
            subtitle="MTR lines, stations and fares © MTR Corporation · via DATA.GOV.HK · station positions © OpenStreetMap contributors (ODbL) · Google Maps Platform (when enabled)"
          />
        </Section>
      </ScrollView>

      <ShareLocationSheet visible={sharingSheet} onClose={() => setSharingSheet(false)} />
      <EditProfileSheet
        visible={editing}
        userId={userId}
        currentName={displayName}
        onClose={() => setEditing(false)}
      />
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const t = useAppTheme();
  return (
    <View style={styles.section}>
      <Text
        style={[type.small, styles.sectionTitle, { color: t.textSecondary }]}
        accessibilityRole="header"
      >
        {title.toUpperCase()}
      </Text>
      <View style={[styles.sectionBody, { borderColor: t.border }]}>{children}</View>
    </View>
  );
}

function Value({ text }: { text: string }) {
  const t = useAppTheme();
  return <Text style={[type.body, { color: t.textSecondary }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex1: { flex: 1 },
  content: { paddingVertical: space.lg, gap: space.xl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    paddingHorizontal: space.lg,
  },
  progressTrack: { height: 8, borderRadius: radius.round, overflow: 'hidden', marginTop: space.sm },
  progressFill: { height: '100%', borderRadius: radius.round },
  inset: { paddingHorizontal: space.lg, gap: space.sm },
  retry: { minHeight: TAP_TARGET, justifyContent: 'center' },
  banner: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'flex-start',
    marginHorizontal: space.lg,
    padding: space.lg,
    borderRadius: radius.md,
  },
  grid: { flexDirection: 'row', gap: space.sm },
  badges: { gap: space.sm, paddingHorizontal: space.lg },
  section: { gap: space.sm },
  sectionTitle: { paddingHorizontal: space.lg, fontWeight: '600' },
  sectionBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  themeRow: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm },
});
