/**
 * Profile → Diagnostics → "Test smart routing": plans Exit A1 → Mong Man-wai Building with the live
 * smart-route function and shows how long it took and what came back (brief §7). A quick check
 * before a demo that the walking graph, shade and the function all work together.
 */
import { formatDuration, PRESETS } from '@scenic/shared';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { smartRoute } from '@/lib/api';
import { useAppTheme } from '@/theme';

const point = (id: string) => PRESETS.find((p) => p.id === id)!.point;

export function SmartRoutingTest() {
  const t = useAppTheme();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const run = () => {
    setRunning(true);
    setResult(null);
    const started = Date.now();
    smartRoute({
      origin: point('kot-exit-a1'),
      destination: point('cityu-mmw'),
      profile: 'sheltered',
      condition: 'rain',
    })
      .then((res) => {
        const seconds = ((Date.now() - started) / 1000).toFixed(1);
        const first = res.options[0];
        setResult(
          res.status === 'ok' && first
            ? {
                ok: true,
                text: `${res.options.length} routes in ${seconds} s · sheltered ${formatDuration(first.duration_s)}, ${first.pct_covered} % covered · map build ${res.graph?.build_id}, shade ${res.graph?.shade_date ?? 'none'}`,
              }
            : { ok: false, text: `No computed route (${res.status}) after ${seconds} s` },
        );
      })
      .catch((err: Error) => setResult({ ok: false, text: err.message }))
      .finally(() => setRunning(false));
  };

  return (
    <>
      <Pressable accessibilityRole="button" disabled={running} onPress={run} style={styles.button}>
        {running ? (
          <ActivityIndicator />
        ) : (
          <ThemedText type="linkPrimary">Test smart routing (Exit A1 → MMW)</ThemedText>
        )}
      </Pressable>
      {result ? (
        <ThemedText
          type="small"
          accessibilityLiveRegion="polite"
          style={{ color: result.ok ? t.primary : t.danger }}
        >
          {result.ok ? '✓ ' : '✗ '}
          {result.text}
        </ThemedText>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 44, justifyContent: 'center' },
});
