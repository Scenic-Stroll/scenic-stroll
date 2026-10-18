/**
 * On a friend's profile, while they share their location: how long it takes to reach them by each
 * way to travel ("🚶 18 min · 🚇 12 min · 🚗 8 min · 🚕 11 min") — multimodal step 7, brief §6.
 * Uses the same plan-trip call as the map. Your own position is only read if you've already allowed
 * location (we don't pop a permission prompt just for this line).
 */
import { formatDuration, type LatLng, type TripOption } from '@scenic/shared';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import type { IconName } from '@/components/ui/icon';
import { useTripPlan } from '@/lib/trips';
import { space, type, useAppTheme } from '@/theme';

const MODES: { mode: TripOption['mode']; icon: IconName; label: string }[] = [
  { mode: 'walk', icon: 'walk', label: 'Walk' },
  { mode: 'transit', icon: 'train', label: 'MTR' },
  { mode: 'car', icon: 'car', label: 'Car' },
  { mode: 'taxi', icon: 'taxi', label: 'Taxi' },
];

/** Where you are, if location is already allowed; null otherwise (no prompt). */
function useMyPosition() {
  return useQuery({
    queryKey: ['my-position'],
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<LatLng | null> => {
      const permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted) return null;
      const fix =
        (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 })) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      return { lat: fix.coords.latitude, lng: fix.coords.longitude };
    },
  });
}

export function FriendTravelTimes({ friendPoint }: { friendPoint: LatLng }) {
  const t = useAppTheme();
  const me = useMyPosition();
  const trips = useTripPlan({
    origin: me.data ?? null,
    destination: friendPoint,
    condition: 'normal',
    departure: null,
    enabled: !!me.data,
  });
  if (me.isPending) return null;
  if (!me.data) {
    return (
      <Text style={[type.caption, { color: t.textSecondary }]}>
        Allow location on the map to see how long it takes to reach them.
      </Text>
    );
  }
  const options = trips.data?.options ?? [];
  const best = options[0];
  return (
    <View style={styles.box}>
      <Text style={[type.small, { color: t.textPrimary }]}>
        {trips.isPending
          ? 'Comparing ways to get there…'
          : best
            ? `Getting there: best is ${best.title.toLowerCase()}, ${formatDuration(best.total_s)}`
            : 'Travel times unavailable right now'}
      </Text>
      <View style={styles.chips}>
        {MODES.map(({ mode, icon, label }) => {
          const fastest = Math.min(...options.filter((o) => o.mode === mode).map((o) => o.total_s));
          return Number.isFinite(fastest) ? (
            <Chip key={mode} small icon={icon} label={`${label} ${formatDuration(fastest)}`} />
          ) : null;
        })}
      </View>
      <Text style={[type.caption, { color: t.textSecondary }]}>
        To their shared location (it may be approximate).
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.xs, paddingVertical: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
