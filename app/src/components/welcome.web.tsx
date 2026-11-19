// The website's first-run screen: what Scenic Stroll does, where it works, "Beta", and Start.
// Shown over the map on the first visit to the home page only (never over a shared link such as
// /privacy). Remembered in this browser once you tap Start. DECISIONS D47.
import { Image } from 'expo-image';
import { router, usePathname } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/ui/primary-button';
import { radius, space, type, useAppTheme } from '@/theme';

const SEEN_KEY = 'scenic-stroll:welcome-seen';

function seenBefore(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false; // private mode etc.: show it, nothing breaks
  }
}

export function Welcome() {
  const t = useAppTheme();
  const pathname = usePathname();
  const [open, setOpen] = useState(() => !seenBefore());
  if (!open || pathname !== '/') return null;

  const start = () => {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Not remembered; it will show again next time. Fine.
    }
    setOpen(false);
  };

  return (
    <View style={[styles.backdrop, { backgroundColor: t.overlay }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        style={styles.fill}
        accessibilityViewIsModal
      >
        <View
          style={[styles.card, { backgroundColor: t.background }]}
          accessibilityRole="none"
          accessibilityLabel="Welcome to Scenic Stroll"
        >
          <View style={styles.titleRow}>
            <Image
              source={{ uri: '/icons/icon-192.png' }}
              style={styles.logo}
              accessibilityIgnoresInvertColors
              alt=""
            />
            <Text accessibilityRole="header" style={[type.heading, { color: t.textPrimary }]}>
              Scenic Stroll
            </Text>
            <View
              style={[styles.beta, { backgroundColor: t.warningSurface, borderColor: t.warning }]}
            >
              <Text style={[type.caption, styles.betaText, { color: t.textPrimary }]}>BETA</Text>
            </View>
          </View>

          <Text style={[type.body, { color: t.textPrimary }]}>
            Find the shaded, sheltered or step-free way to walk — and compare it with the MTR, bus,
            taxi and car.
          </Text>

          <View style={[styles.coverage, { backgroundColor: t.surface }]}>
            <Text style={[type.small, { color: t.textPrimary }]}>
              <Text style={styles.bold}>Smart walking routes:</Text> CityU, Kowloon Tong MTR and
              Festival Walk.
            </Text>
            <Text style={[type.small, { color: t.textPrimary }]}>
              <Text style={styles.bold}>Transport comparison:</Text> all of Hong Kong.
            </Text>
          </View>

          <Text style={[type.caption, { color: t.textSecondary }]}>
            Your browser will ask for your location to show where you are. You can say no and pick a
            start point on the map instead. Shade, weather and CO₂ figures are estimates.
          </Text>

          <PrimaryButton label="Start" icon="walk" onPress={start} />

          <View style={styles.links}>
            {(
              [
                ['Privacy (draft)', '/privacy'],
                ['Terms (draft)', '/terms'],
                ['Data sources', '/attribution'],
                ['Feedback', '/feedback'],
              ] as const
            ).map(([label, href]) => (
              <Pressable
                key={href}
                accessibilityRole="link"
                onPress={() => router.push(href)}
                hitSlop={6}
              >
                <Text style={[type.small, styles.link, { color: t.primary }]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, zIndex: 2000 },
  fill: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: space.lg },
  card: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    borderRadius: radius.sheet,
    padding: space.xl,
    gap: space.lg,
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.25)',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  logo: { width: 48, height: 48, borderRadius: radius.md },
  beta: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  betaText: { fontWeight: '700', letterSpacing: 1 },
  coverage: { padding: space.md, borderRadius: radius.md, gap: space.xs },
  bold: { fontWeight: '700' },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.lg },
  link: { textDecorationLine: 'underline' },
});
