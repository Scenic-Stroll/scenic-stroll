import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { useBackgroundSync } from '@/hooks/use-background-sync';
import { queryClient } from '@/lib/query-client';
import { AuthProvider } from '@/providers/auth-provider';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
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
