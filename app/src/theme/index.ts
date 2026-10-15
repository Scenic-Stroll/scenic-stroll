import { useColorScheme } from 'react-native';

import { useSettings } from '@/lib/settings-store';

import { palettes, type ColorSchemeName, type Palette } from './tokens';

export * from './tokens';

/**
 * The active colour scheme: the user's choice in Profile → Theme, or the phone's setting
 * when the choice is "system" (the default).
 */
export function useColorSchemeName(): ColorSchemeName {
  const system = useColorScheme();
  const preference = useSettings((s) => s.themePreference);
  if (preference !== 'system') return preference;
  return system === 'dark' ? 'dark' : 'light';
}

/** Colours for the active scheme. Use this in every component instead of hard-coded colours. */
export function useAppTheme(): Palette {
  return palettes[useColorSchemeName()];
}
