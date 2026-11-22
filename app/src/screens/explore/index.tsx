// Explore tab (D56): topic boards will live here. For now a placeholder that says what's coming;
// the clickable mock-up is under "Preview" (pins phase 7).
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/ui/empty-state';
import { space, type, useAppTheme } from '@/theme';

export function ExploreScreen() {
  const t = useAppTheme();
  return (
    <SafeAreaView edges={['top']} style={[styles.fill, { backgroundColor: t.background }]}>
      <Text
        accessibilityRole="header"
        style={[type.heading, styles.title, { color: t.textPrimary }]}
      >
        Explore
      </Text>
      <View style={styles.center}>
        <EmptyState
          icon="compass-outline"
          title="Topic boards are coming"
          body="Boards will group pins by topic — street names, shelter from the heat, old Kowloon — so you can plan a walk to collect a whole set."
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  title: { paddingHorizontal: space.lg, paddingTop: space.lg },
  center: { flex: 1, justifyContent: 'center' },
});
