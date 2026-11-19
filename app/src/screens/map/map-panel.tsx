/**
 * The map screen's panel (place card, route planning, walking directions, nearby routes).
 * Narrow screens (phones): a bottom sheet you drag between peek / half / full, as before.
 * Wide screens (a laptop or tablet in a browser): a fixed panel on the left, so the map stays
 * visible next to the route list instead of being half covered.
 * `snapToIndex` works on both; on the wide panel it does nothing (the panel is always open).
 */
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { forwardRef, useImperativeHandle, useRef, type ReactNode } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { radius, space, useAppTheme } from '@/theme';

/** At this width and above, the panel sits beside the map. */
export const WIDE_LAYOUT_MIN_WIDTH = 900;
export const SIDE_PANEL_WIDTH = 400;
/** Space at the top for the search bar and filter chips. */
const SIDE_PANEL_TOP = 124;

export function useWideLayout(): boolean {
  return useWindowDimensions().width >= WIDE_LAYOUT_MIN_WIDTH;
}

/**
 * Padding to keep a fitted route clear of the search bar and the panel. On phones the sheet
 * covers the bottom half; on wide screens the panel covers the left side.
 */
export function routeFitPadding(wide: boolean) {
  return wide
    ? { top: SIDE_PANEL_TOP + 40, right: 80, bottom: 60, left: SIDE_PANEL_WIDTH + 80 }
    : { top: 200, right: 80, bottom: 380, left: 60 };
}

export type MapPanelHandle = { snapToIndex: (index: number) => void };

export const MapPanel = forwardRef<
  MapPanelHandle,
  {
    snapPoints: string[];
    initialIndex: number;
    accessibilityLabel: string;
    children: ReactNode;
  }
>(function MapPanel({ snapPoints, initialIndex, accessibilityLabel, children }, ref) {
  const t = useAppTheme();
  const wide = useWideLayout();
  const sheet = useRef<BottomSheet>(null);

  useImperativeHandle(ref, () => ({
    snapToIndex: (index) => sheet.current?.snapToIndex(index),
  }));

  if (wide) {
    return (
      <View
        accessibilityLabel={accessibilityLabel}
        style={[styles.side, { backgroundColor: t.background, borderColor: t.border }]}
      >
        <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>
    );
  }

  return (
    <BottomSheet
      ref={sheet}
      index={initialIndex}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      backgroundStyle={{ backgroundColor: t.background, borderRadius: radius.sheet }}
      handleIndicatorStyle={{ backgroundColor: t.border, width: 40 }}
      accessibilityLabel={accessibilityLabel}
    >
      <BottomSheetScrollView keyboardShouldPersistTaps="handled">{children}</BottomSheetScrollView>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  side: {
    position: 'absolute',
    top: SIDE_PANEL_TOP,
    left: space.md,
    bottom: space.md,
    width: SIDE_PANEL_WIDTH,
    borderRadius: radius.sheet,
    borderWidth: 1,
    overflow: 'hidden',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
  },
});
