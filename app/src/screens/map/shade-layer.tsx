/**
 * "Shade now" (Layers menu): every outdoor walking path coloured by estimated shade at this half
 * hour — orange in the sun, yellow partly shaded, green in shade, blue under a cover. Drawn under the
 * routes. ShadeLegend is the small card that says what time it shows and what the colours mean.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Polyline } from 'react-native-maps';

import { bucketLabel, type ShadeClass, type ShadeLine } from '@/lib/shade-layer';
import { radius, shadow, space, type, useAppTheme, type Palette } from '@/theme';

/** Never draw more than this many lines at once (a safety net for very wide boxes). */
const MAX_LINES = 1500;

export const SHADE_LABELS: Record<ShadeClass, string> = {
  sun: 'Sun',
  part: 'Part shade',
  shade: 'Shade',
  covered: 'Covered',
};

export function shadeColor(cls: ShadeClass, t: Palette): string {
  switch (cls) {
    case 'sun':
      return t.routeSun;
    case 'part':
      return t.shadePartial;
    case 'shade':
      return t.routeShade;
    case 'covered':
      return t.routeCovered;
  }
}

export function ShadeLayer({ lines }: { lines: ShadeLine[] }) {
  const t = useAppTheme();
  return (
    <>
      {lines.slice(0, MAX_LINES).map((l, i) => (
        <Polyline
          // Lines only change all together (new time or box), so the index is a fine key here.
          key={`shade-${i}`}
          coordinates={l.points.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
          strokeColor={shadeColor(l.cls, t)}
          strokeWidth={3}
          zIndex={0}
        />
      ))}
    </>
  );
}

export function ShadeLegend({
  bucket,
  reference,
  zoomedOut,
  loading,
  failed,
}: {
  bucket: number;
  /** true = it's dark now; showing 13:00 for reference. */
  reference: boolean;
  zoomedOut: boolean;
  loading: boolean;
  failed: boolean;
}) {
  const t = useAppTheme();
  const status = zoomedOut
    ? 'Zoom in to see shade on each path'
    : failed
      ? 'Couldn’t load shade — check your connection'
      : loading
        ? 'Loading shade…'
        : reference
          ? `No sun now — showing ${bucketLabel(bucket)} for reference`
          : `Shade at ${bucketLabel(bucket)} (estimated)`;
  return (
    <View
      style={[styles.card, shadow, { backgroundColor: t.background }]}
      accessibilityLiveRegion="polite"
    >
      <Text style={[type.caption, styles.bold, { color: t.textPrimary }]}>{status}</Text>
      {!zoomedOut ? (
        <View style={styles.row}>
          {(['sun', 'part', 'shade', 'covered'] as const).map((cls) => (
            <View key={cls} style={styles.item}>
              <View style={[styles.swatch, { backgroundColor: shadeColor(cls, t) }]} />
              <Text style={[type.caption, { color: t.textSecondary }]}>{SHADE_LABELS[cls]}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'flex-start',
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.xs,
  },
  bold: { fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.md, rowGap: space.xs },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  swatch: { width: 16, height: 4, borderRadius: 2 },
});
