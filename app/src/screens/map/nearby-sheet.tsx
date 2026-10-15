/**
 * Bottom sheet, default state: community routes near you (or near CityU if location is off),
 * filtered by the chips at the top of the map.
 */
import {
  FILTERS,
  formatDistance,
  formatDuration,
  haversineMeters,
  matchesFilters,
  TAXONOMY,
  isTag,
  type CommunityRoute,
  type FilterKey,
  type LatLng,
} from '@scenic/shared';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorCard } from '@/components/ui/error-card';
import { Icon } from '@/components/ui/icon';
import { PrimaryButton } from '@/components/ui/primary-button';
import { radius, space, TAP_TARGET, type, useAppTheme } from '@/theme';

/** Only routes starting within this distance count as "nearby". */
const NEARBY_METERS = 3000;

export function NearbySheet({
  routes,
  isLoading,
  error,
  onRetry,
  center,
  filters,
  selectedId,
  onSelectRoute,
  onRecord,
}: {
  routes: CommunityRoute[] | undefined;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  center: LatLng;
  filters: ReadonlySet<FilterKey>;
  selectedId: string | null;
  onSelectRoute: (route: CommunityRoute) => void;
  onRecord: () => void;
}) {
  const t = useAppTheme();

  const nearby = (routes ?? [])
    .map((route) => ({ route, away: haversineMeters(center, route.line[0]!) }))
    .filter((r) => r.away <= NEARBY_METERS)
    .sort((a, b) => a.away - b.away);
  const shown = nearby.filter((r) => matchesFilters(r.route, filters));
  const activeFilterNames = FILTERS.filter((f) => filters.has(f.key)).map((f) => f.en);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[type.title, { color: t.textPrimary }]} accessibilityRole="header">
          Nearby
        </Text>
        <Text style={[type.small, { color: t.textSecondary }]}>
          {isLoading
            ? 'Loading community routes…'
            : `${shown.length} community route${shown.length === 1 ? '' : 's'}${
                activeFilterNames.length ? ` · ${activeFilterNames.join(', ')}` : ''
              }`}
        </Text>
      </View>

      {isLoading ? <ActivityIndicator style={styles.loading} /> : null}
      {error ? (
        <ErrorCard title="Couldn’t load routes" message={error.message} onRetry={onRetry} />
      ) : null}

      {!isLoading && !error && nearby.length === 0 ? (
        <EmptyState
          icon="map-marker-path"
          title="No community routes here yet"
          body="Be the first to log one — record the way you actually walk, with lifts, malls and footbridges."
          action={<PrimaryButton label="Record a route" icon="record-rec" onPress={onRecord} />}
        />
      ) : null}
      {!isLoading && !error && nearby.length > 0 && shown.length === 0 ? (
        <EmptyState
          icon="filter-variant-remove"
          title="No routes match these filters yet"
          body="Routes get tags like sheltered or step-free from their descriptions. Try fewer filters."
        />
      ) : null}

      {shown.map(({ route, away }) => (
        <RouteRow
          key={route.id}
          route={route}
          away={away}
          selected={route.id === selectedId}
          onPress={() => onSelectRoute(route)}
        />
      ))}
    </View>
  );
}

function RouteRow({
  route,
  away,
  selected,
  onPress,
}: {
  route: CommunityRoute;
  away: number;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useAppTheme();
  const verified = route.status === 'verified';
  const tags = route.tags.filter(isTag).slice(0, 3);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${route.title}, ${formatDuration(route.durationS)}, ${formatDistance(route.distanceM)}, ${verified ? 'verified' : 'not verified yet'}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: selected || pressed ? t.surface : 'transparent',
          borderColor: selected ? t.primary : t.border,
        },
      ]}
    >
      <View style={[styles.lineIcon, { backgroundColor: t.surface }]}>
        <Icon name="map-marker-path" size={22} color={t.accent} />
      </View>
      <View style={styles.rowText}>
        <Text style={[type.body, { color: t.textPrimary, fontWeight: '600' }]} numberOfLines={1}>
          {route.title}
        </Text>
        <Text style={[type.small, { color: t.textSecondary }]} numberOfLines={1}>
          {formatDuration(route.durationS)} · {formatDistance(route.distanceM)} · starts{' '}
          {formatDistance(away)} away
        </Text>
        <View style={styles.chips}>
          <Chip
            small
            icon={verified ? 'check-decagram' : 'clock-outline'}
            label={verified ? 'Verified' : 'Unverified'}
          />
          {tags.map((tag) => (
            <Chip key={tag} small label={TAXONOMY[tag].en} />
          ))}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.xl },
  header: { gap: 2 },
  loading: { paddingVertical: space.lg },
  row: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: TAP_TARGET,
  },
  lineIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
