// Shown instead of a feature that safety mode turns off (under-18s, D52).
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/ui/empty-state';
import { useAppTheme } from '@/theme';

export function SafetyNotice({ feature }: { feature: string }) {
  const t = useAppTheme();
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: t.background }]}>
      <View style={styles.center}>
        <EmptyState
          icon="shield-check-outline"
          title={`${feature} is off in safety mode`}
          body="Safety mode is on for everyone under 18. You can still plan routes and collect and read pins."
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, justifyContent: 'center' },
});
