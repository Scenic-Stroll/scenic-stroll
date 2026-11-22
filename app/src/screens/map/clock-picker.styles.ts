// Styles shared by clock-picker.tsx (phones) and clock-picker.web.tsx (browser).
import { StyleSheet } from 'react-native';

import { space } from '@/theme';

export const styles = StyleSheet.create({
  done: {
    alignSelf: 'flex-end',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
});
