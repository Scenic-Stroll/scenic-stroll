// Web: a thin bar at the top while the browser has no internet. When the app is opened offline
// from the saved copy (public/sw.js), this tells people why the map and routes don't load.
import { useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { space, useAppTheme } from '@/theme';

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

export function OfflineBanner() {
  const t = useAppTheme();
  const online = useSyncExternalStore(subscribe, () => navigator.onLine);
  if (online) return null;
  return (
    <View
      accessibilityRole="alert"
      pointerEvents="none"
      style={[styles.bar, { backgroundColor: t.warningSurface, borderColor: t.warning }]}
    >
      <Text style={[styles.text, { color: t.textPrimary }]}>
        You’re offline — maps, weather and routes come back when you reconnect.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
    borderBottomWidth: 1,
  },
  text: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
