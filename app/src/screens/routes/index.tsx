/**
 * Routes tab: My routes (recorded on this phone) · Saved · Explore.
 * Saved and Explore are filled in later steps; until then they say so honestly.
 */
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/ui/empty-state';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { MyRoutes } from '@/screens/my-routes';
import { space, type, useAppTheme } from '@/theme';

const TABS = [
  { key: 'mine', label: 'My routes' },
  { key: 'saved', label: 'Saved' },
  { key: 'explore', label: 'Explore' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export function RoutesScreen() {
  const t = useAppTheme();
  const [tab, setTab] = useState<TabKey>('mine');

  const header = (
    <View style={styles.header}>
      <Text style={[type.heading, { color: t.textPrimary }]} accessibilityRole="header">
        Routes
      </Text>
      <SegmentedTabs options={TABS} value={tab} onChange={setTab} />
    </View>
  );

  if (tab === 'mine') return <MyRoutes header={header} />;

  return (
    <SafeAreaView edges={['top']} style={[styles.fill, { backgroundColor: t.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {header}
        {tab === 'saved' ? (
          <EmptyState
            icon="bookmark-outline"
            title="No saved routes yet"
            body="Saving community routes is coming soon. Your own recordings are under My routes."
          />
        ) : (
          <EmptyState
            icon="compass-outline"
            title="Explore is coming soon"
            body="Popular and verified community routes around CityU and Kowloon Tong will appear here."
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { gap: space.md },
  content: { paddingHorizontal: space.lg, paddingTop: space.xl, gap: space.lg },
});
