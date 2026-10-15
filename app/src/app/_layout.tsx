import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { useBackgroundSync } from '@/hooks/use-background-sync';
import { queryClient } from '@/lib/query-client';
import { AuthProvider } from '@/providers/auth-provider';
import { palettes, useColorSchemeName } from '@/theme';

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
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider value={navigationTheme}>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <BackgroundSync />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="recording/[id]"
              options={{ presentation: 'modal', headerShown: true, title: 'Review route' }}
            />
          </Stack>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

/** Renders nothing; recovers interrupted recordings and keeps the upload queue moving. */
function BackgroundSync() {
  useBackgroundSync();
  return null;
}
