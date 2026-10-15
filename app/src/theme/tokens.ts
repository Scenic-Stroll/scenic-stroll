/**
 * Scenic Stroll design tokens — the ONLY place colours, sizes and shadows are defined.
 * Layout and interaction patterns are inspired by city-map apps (search bar on the map, sliding
 * cards, chips); the visual identity (name, green, icons) is our own. See DECISIONS.md D16.
 *
 * Both themes have exactly the same keys, so a screen never needs to know which one is active.
 */
import { Platform } from 'react-native';

const light = {
  // Buttons, selected chips, active tab, green text. #14822A gives 4.9:1 with white (WCAG AA);
  // the brighter #1BA136 from the brief only reaches 3.4:1, so it is kept as `accent` for
  // route lines and map graphics (non-text needs 3:1). See DECISIONS.md D16.
  primary: '#14822A',
  primaryPressed: '#0F6B22',
  onPrimary: '#FFFFFF',
  accent: '#1BA136',
  background: '#FFFFFF',
  surface: '#F4F5F7',
  surfacePressed: '#E8EAED',
  border: '#E3E5E8',
  textPrimary: '#141414',
  textSecondary: '#6B7079', // darker than #8A8F98 so small text passes WCAG AA on white
  routeCommunity: '#1BA136',
  routeStandard: '#9AA0A6',
  routeStepFree: '#2D7FF9',
  warning: '#E07B00',
  danger: '#D93025',
  overlay: 'rgba(0,0,0,0.35)',
};

export type Palette = typeof light;

const dark: Palette = {
  primary: '#34C152',
  primaryPressed: '#28A043',
  onPrimary: '#0B1F10', // dark text on bright green: 7.9:1 (white would be 2.4:1)
  accent: '#34C152',
  background: '#121314',
  surface: '#1E2023',
  surfacePressed: '#2A2D31',
  border: '#2E3135',
  textPrimary: '#F2F3F5',
  textSecondary: '#A3A8B0',
  routeCommunity: '#34C152',
  routeStandard: '#8E949B',
  routeStepFree: '#5B9BFF',
  warning: '#FFA43A',
  danger: '#FF6B5E',
  overlay: 'rgba(0,0,0,0.55)',
};

export const palettes = { light, dark } as const;
export type ColorSchemeName = keyof typeof palettes;

/** 4-pt spacing scale. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = {
  /** cards, inputs */
  md: 12,
  /** bottom sheet top corners */
  sheet: 20,
  /** floating buttons, chips */
  round: 999,
} as const;

/** System font; sizes 12 / 14 / 16 / 20 / 24, semibold for titles. */
export const type = {
  caption: { fontSize: 12, lineHeight: 16 },
  small: { fontSize: 14, lineHeight: 20 },
  body: { fontSize: 16, lineHeight: 22 },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '600' as const },
  heading: { fontSize: 24, lineHeight: 30, fontWeight: '600' as const },
} as const;

/** Soft, low-opacity shadow — floating elements only. */
export const shadow = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  default: { elevation: 4 },
})!;

/** Minimum tap target (accessibility). */
export const TAP_TARGET = 44;
