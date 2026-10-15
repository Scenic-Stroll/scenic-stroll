/**
 * Profile tab. Step 1 of the redesign: account header, preferences (theme, data collection mode),
 * diagnostics and about — everything that used to be on the Settings tab.
 * Stats, levels and badges are added in step 4.
 */
import { TAGS } from '@scenic/shared';
import Constants from 'expo-constants';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DiagnosticsCard } from '@/components/diagnostics-card';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { ListRow } from '@/components/ui/list-row';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { useSettings, type ThemePreference } from '@/lib/settings-store';
import { useAuth } from '@/providers/auth-provider';
import { radius, space, TAP_TARGET, type, useAppTheme } from '@/theme';

const THEME_OPTIONS = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
] as const satisfies readonly { key: ThemePreference; label: string }[];

export function ProfileScreen() {
  const t = useAppTheme();
  const auth = useAuth();
  const dataCollection = useSettings((s) => s.dataCollectionMode);
  const setDataCollection = useSettings((s) => s.setDataCollectionMode);
  const themePreference = useSettings((s) => s.themePreference);
  const setThemePreference = useSettings((s) => s.setThemePreference);

  const isAnonymous = auth.status === 'signed-in' && auth.session.user.is_anonymous;
  let accountLine = 'Signing in…';
  if (auth.status === 'signed-in') {
    accountLine = `${isAnonymous ? 'Anonymous account' : 'Email account'} · ${auth.session.user.id.slice(0, 8)}`;
  } else if (auth.status === 'error') {
    accountLine = `Not signed in: ${auth.message}`;
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.fill, { backgroundColor: t.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Avatar name={null} size={64} />
          <View style={styles.flex1}>
            <Text style={[type.heading, { color: t.textPrimary }]}>Anonymous walker</Text>
            <Text style={[type.small, { color: t.textSecondary }]} accessibilityLiveRegion="polite">
              {accountLine}
            </Text>
            {auth.status === 'error' ? (
              <Pressable
                accessibilityRole="button"
                onPress={auth.retry}
                hitSlop={8}
                style={styles.retry}
              >
                <Text style={[type.small, { color: t.primary, fontWeight: '600' }]}>Try again</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {isAnonymous ? (
          <View style={[styles.banner, { backgroundColor: t.surface }]}>
            <Icon name="account-plus-outline" size={22} color={t.primary} />
            <Text style={[type.small, styles.flex1, { color: t.textPrimary }]}>
              Create an account to keep your points and add friends. Email accounts are coming soon
              — until then your routes and points stay with this phone.
            </Text>
          </View>
        ) : null}

        <Section title="Preferences">
          <View style={styles.themeRow}>
            <Text style={[type.body, { color: t.textPrimary }]}>Theme</Text>
            <SegmentedTabs
              options={THEME_OPTIONS}
              value={themePreference}
              onChange={setThemePreference}
            />
          </View>
          <ListRow
            icon="clipboard-list-outline"
            title="Data collection mode"
            subtitle="Team walks: bigger buttons, auto-numbered titles, “Save & record another”, no 50 m trim"
            right={
              <Switch
                value={dataCollection}
                onValueChange={setDataCollection}
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
        </Section>
      </ScrollView>
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
  retry: { minHeight: TAP_TARGET, justifyContent: 'center', alignSelf: 'flex-start' },
  banner: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'flex-start',
    marginHorizontal: space.lg,
    padding: space.lg,
    borderRadius: radius.md,
  },
  section: { gap: space.sm },
  sectionTitle: { paddingHorizontal: space.lg, fontWeight: '600' },
  sectionBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  themeRow: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm },
  inset: { padding: space.lg },
});
