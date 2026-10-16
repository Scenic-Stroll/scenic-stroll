/**
 * Profile → Diagnostics, demo tools for follow mode (smart routing step 6):
 *   - "Simulate walk": follow mode moves a pretend walker along the route at 4× speed instead of
 *     using GPS, so re-routing can be shown anywhere (with "Step off route" / "Make it rain").
 *   - "Clear my blocked-path reports": a demo report would otherwise block that path for 3 hours.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Chip } from '@/components/ui/chip';
import { useFollowDemo } from '@/lib/follow-store';
import { clearMyPathReports } from '@/lib/path-reports';
import { space } from '@/theme';

export function FollowDemoControls() {
  const simulateWalk = useFollowDemo((d) => d.simulateWalk);
  const setSimulateWalk = useFollowDemo((d) => d.setSimulateWalk);
  const [clearResult, setClearResult] = useState<string | null>(null);

  const clear = () => {
    setClearResult('Clearing…');
    clearMyPathReports()
      .then((n) =>
        setClearResult(n === 0 ? 'You have no active reports.' : `Removed ${n} report(s).`),
      )
      .catch((err: Error) => setClearResult(err.message));
  };

  return (
    <>
      <ThemedText type="small" themeColor="textSecondary">
        Simulate walk (demo) — follow mode walks the route by itself
      </ThemedText>
      <View style={styles.chips}>
        <Chip small label="Off" selected={!simulateWalk} onPress={() => setSimulateWalk(false)} />
        <Chip small label="On" selected={simulateWalk} onPress={() => setSimulateWalk(true)} />
      </View>
      <Pressable accessibilityRole="button" onPress={clear} style={styles.button}>
        <ThemedText type="linkPrimary">Clear my blocked-path reports</ThemedText>
      </Pressable>
      {clearResult ? (
        <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
          {clearResult}
        </ThemedText>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  button: { minHeight: 44, justifyContent: 'center' },
});
