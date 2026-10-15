/**
 * Profile → Diagnostics: which Supabase project the app talks to, whether we're signed in,
 * and a "Test backend" button that pings every Edge Function and shows OK / the problem.
 */
import { FUNCTIONS, type FunctionName } from '@scenic/shared';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { FunctionCallError, pingFunction } from '@/lib/api';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useAppTheme } from '@/theme';

type Result = { name: FunctionName; ok: boolean; text: string };

/** "https://xelz…edru.supabase.co" — enough to tell projects apart, not the full ref. */
function maskedUrl(): string {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!url) return 'not set (app/.env missing)';
  return url.replace(/^(https?:\/\/)([a-z0-9]{4})[a-z0-9]+([a-z0-9]{4})(\.)/i, '$1$2…$3$4');
}

export function DiagnosticsCard() {
  const t = useAppTheme();
  const auth = useAuth();
  const [results, setResults] = useState<Result[] | null>(null);
  const [testing, setTesting] = useState(false);

  const signedIn =
    auth.status === 'signed-in'
      ? `Yes${auth.session.user.is_anonymous ? ' (anonymous)' : ''}`
      : auth.status === 'loading'
        ? 'Signing in…'
        : `No — ${auth.message}`;

  const test = async () => {
    setTesting(true);
    const names = Object.values(FUNCTIONS);
    // Ping all functions at once; one failing must not hide the others' results.
    const settled = await Promise.allSettled(names.map((name) => pingFunction(name)));
    setResults(
      settled.map((r, i) => {
        const name = names[i]!;
        if (r.status === 'fulfilled') {
          const missing = r.value.missingSecrets;
          return missing.length === 0
            ? { name, ok: true, text: `OK (provider: ${r.value.provider})` }
            : { name, ok: false, text: `Deployed, but missing secret: ${missing.join(', ')}` };
        }
        const err = r.reason;
        return {
          name,
          ok: false,
          text: err instanceof FunctionCallError ? err.message : String(err),
        };
      }),
    );
    setTesting(false);
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">Diagnostics</ThemedText>
      <Row label="Supabase" value={maskedUrl()} />
      <Row label="Signed in" value={signedIn} />

      <Pressable
        accessibilityRole="button"
        disabled={testing || !isSupabaseConfigured}
        onPress={test}
        style={styles.button}
      >
        {testing ? <ActivityIndicator /> : <ThemedText type="linkPrimary">Test backend</ThemedText>}
      </Pressable>

      {results?.map((r) => (
        <View key={r.name} style={styles.result} accessibilityLiveRegion="polite">
          <ThemedText style={{ color: r.ok ? t.primary : t.danger }}>{r.ok ? '✓' : '✗'}</ThemedText>
          <View style={styles.flex1}>
            <ThemedText type="smallBold">{r.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {r.text}
            </ThemedText>
          </View>
        </View>
      ))}
    </ThemedView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
        {label}
      </ThemedText>
      <ThemedText type="small" style={styles.flex1}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two },
  label: { width: 72 },
  flex1: { flex: 1 },
  button: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  result: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
});
