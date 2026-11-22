// Any address the app doesn't know (a mistyped or old link on the website). Replaces Expo
// Router's developer screen ("Unmatched Route" + a sitemap), which shouldn't be public.
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/ui/empty-state';
import { PrimaryButton } from '@/components/ui/primary-button';
import { useAppTheme } from '@/theme';

export default function NotFound() {
  const t = useAppTheme();
  return (
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      <EmptyState
        icon="map-marker-question-outline"
        title="Page not found"
        body="This link doesn’t lead anywhere in Scenic Stroll."
        action={<PrimaryButton label="Go to the map" onPress={() => router.replace('/')} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center' },
});
