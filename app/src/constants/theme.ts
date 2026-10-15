/**
 * Legacy colour names used by ThemedText / ThemedView, now derived from the design tokens in
 * src/theme/tokens.ts (the single source of truth). New code should use useAppTheme() instead.
 */

import { Platform } from 'react-native';

import { palettes } from '@/theme/tokens';

const legacy = (p: (typeof palettes)['light']) => ({
  text: p.textPrimary,
  background: p.background,
  backgroundElement: p.surface,
  backgroundSelected: p.surfacePressed,
  textSecondary: p.textSecondary,
  link: p.primary,
});

export const Colors = {
  light: legacy(palettes.light),
  dark: legacy(palettes.dark),
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

// The tab bar (src/app/(tabs)/_layout.tsx) sits below screen content instead of floating over it,
// so screens need no extra bottom padding for it. Kept as a named constant so that stays obvious.
export const BottomTabInset = 0;
export const MaxContentWidth = 800;
