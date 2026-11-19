import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { OfflineBanner } from '@/components/offline-banner';
import { Welcome } from '@/components/welcome';
import { useBackgroundSync } from '@/hooks/use-background-sync';
import { queryClient } from '@/lib/query-client';
import { registerServiceWorker } from '@/lib/service-worker';
import { startAnalytics } from '@/lib/analytics';
import { startMonitoring } from '@/lib/monitoring';
import { AuthProvider } from '@/providers/auth-provider';
import { palettes, useColorSchemeName } from '@/theme';

// Web only (each does nothing on phones): installable app + offline copy, error reports, visit
// counts. The last two stay off until their EXPO_PUBLIC_ settings exist (docs/DEPLOY.md).
registerServiceWorker();
startMonitoring();
startAnalytics();

export default function RootLayout() {
  // Follows Profile → Theme (system / light / dark).
  const scheme = useColorSchemeName();
  const p = palettes[scheme];
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: p.primary,
      background: p.background,
      card: p.background,
      text: p.textPrimary,
      border: p.border,
    },
  };

  return (
    // GestureHandlerRootView: required by the map bottom sheet (@gorhom/bottom-sheet).
    <GestureHandlerRootView style={styles.root}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider value={navigationTheme}>
            <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
            <BackgroundSync />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="friend/[id]"
                options={{ headerShown: true, title: 'Friend', headerBackTitle: 'Friends' }}
              />
              <Stack.Screen
                name="saved-places"
                options={{ headerShown: true, title: 'Saved places', headerBackTitle: 'Profile' }}
              />
              <Stack.Screen
                name="feedback"
                options={{ headerShown: true, title: 'Send feedback', headerBackTitle: 'Back' }}
              />
              <Stack.Screen
                name="privacy"
                options={{ headerShown: true, title: 'Privacy policy', headerBackTitle: 'Back' }}
              />
              <Stack.Screen
                name="terms"
                options={{ headerShown: true, title: 'Terms of use', headerBackTitle: 'Back' }}
              />
              <Stack.Screen
                name="attribution"
                options={{
                  headerShown: true,
                  title: 'Data sources & credits',
                  headerBackTitle: 'Back',
                }}
              />
              <Stack.Screen
                name="recording/[id]"
                options={{ presentation: 'modal', headerShown: true, title: 'Review route' }}
              />
            </Stack>
            <OfflineBanner />
            <Welcome />
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });

/** Renders nothing; recovers interrupted recordings and keeps the upload queue moving. */
function BackgroundSync() {
  useBackgroundSync();
  return null;
}
