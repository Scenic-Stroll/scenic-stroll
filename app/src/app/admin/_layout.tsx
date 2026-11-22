// The admin area for experts and reviewers (D53). Not a tab: open /admin directly.
import { Stack } from 'expo-router';

export default function AdminLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ title: 'Pins — experts and reviewers' }} />
      <Stack.Screen name="new" options={{ title: 'New pin' }} />
      <Stack.Screen name="pin/[id]" options={{ title: 'Pin' }} />
    </Stack>
  );
}
