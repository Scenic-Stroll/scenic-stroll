// A small, quiet message at the bottom of the screen that goes away by itself — e.g.
// "Pin saved: Why Kent Road is in Kowloon" while walking (D54). Never the pin's text.
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { create } from 'zustand';

import { radius, space, type, useAppTheme } from '@/theme';

const SHOW_MS = 3500;

const useToast = create<{ text: string | null; seq: number }>(() => ({ text: null, seq: 0 }));

export function showToast(text: string) {
  useToast.setState((s) => ({ text, seq: s.seq + 1 }));
}

export function ToastHost() {
  const t = useAppTheme();
  const { text, seq } = useToast();
  useEffect(() => {
    if (!text) return;
    const timer = setTimeout(() => useToast.setState({ text: null }), SHOW_MS);
    return () => clearTimeout(timer);
  }, [text, seq]);
  if (!text) return null;
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[styles.toast, { backgroundColor: t.textPrimary }]}
      >
        <Text numberOfLines={1} style={[type.small, { color: t.background }]}>
          {text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 96, alignItems: 'center', zIndex: 3000 },
  toast: {
    maxWidth: '90%',
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.round,
    opacity: 0.92,
  },
});
