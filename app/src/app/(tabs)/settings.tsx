import { TAGS } from '@scenic/shared';
import Constants from 'expo-constants';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { DiagnosticsCard } from '@/components/diagnostics-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TitledScreen } from '@/components/titled-screen';
import { Spacing } from '@/constants/theme';
import { useSettings } from '@/lib/settings-store';
import { useAuth } from '@/providers/auth-provider';

/**
 * Settings: account status (doubles as a health check), data collection mode, about.
 */
export default function SettingsScreen() {
  const auth = useAuth();
  const dataCollection = useSettings((s) => s.dataCollectionMode);
  const setDataCollection = useSettings((s) => s.setDataCollectionMode);

  let accountText = 'Signing in…';
  if (auth.status === 'signed-in') {
    const kind = auth.session.user.is_anonymous ? 'Anonymous account' : 'Email account';
    accountText = `${kind} · ${auth.session.user.id.slice(0, 8)}`;
  } else if (auth.status === 'error') {
    accountText = `Not signed in: ${auth.message}`;
  }

  return (
    <TitledScreen title="Settings">
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">Account</ThemedText>
        <ThemedText accessibilityLiveRegion="polite">{accountText}</ThemedText>
        {auth.status === 'error' ? (
          <Pressable
            accessibilityRole="button"
            onPress={auth.retry}
            style={styles.button}
            hitSlop={8}
          >
            <ThemedText type="linkPrimary">Try again</ThemedText>
          </Pressable>
        ) : null}
      </ThemedView>

      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.switchRow}>
          <View style={styles.flex1}>
            <ThemedText type="smallBold">Data collection mode</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              For team walks: bigger buttons, auto-numbered titles, “save & record another”, and no
              50 m trimming by default.
            </ThemedText>
          </View>
          <Switch
            value={dataCollection}
            onValueChange={setDataCollection}
            accessibilityLabel="Data collection mode"
          />
        </View>
      </ThemedView>

      <DiagnosticsCard />

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">About</ThemedText>
        <ThemedText type="small">Version {Constants.expoConfig?.version ?? '?'}</ThemedText>
        <ThemedText type="small">{TAGS.length} route tags loaded</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Landmark data © OpenStreetMap contributors (ODbL)
        </ThemedText>
      </ThemedView>
    </TitledScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  flex1: { flex: 1 },
  button: {
    minHeight: 44, // accessible tap target
    justifyContent: 'center',
  },
});
