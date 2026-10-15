import { Colors } from '@/constants/theme';
import { useColorSchemeName } from '@/theme';

/** Legacy colour names for ThemedText / ThemedView. Follows Profile → Theme (system/light/dark). */
export function useTheme() {
  return Colors[useColorSchemeName()];
}
