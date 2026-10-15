/**
 * Bottom sheet, route planning state: From / To, mode tabs (Fastest · Sheltered · Shaded ·
 * Step-free) and the route options. Community route options arrive with Phase 4 (find-routes);
 * until then each mode honestly says so and the standard walking route is listed.
 */
import { buildSegments, type PlanRouteResponse } from '@scenic/shared';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { DirectionsList } from '@/components/route/directions-list';
import { RouteOptionCard } from '@/components/route/route-option-card';
import { ErrorCard } from '@/components/ui/error-card';
import { Icon } from '@/components/ui/icon';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { radius, space, TAP_TARGET, type, useAppTheme } from '@/theme';

import type { Place } from './types';

export const ROUTE_MODES = [
  { key: 'fastest', label: 'Fastest' },
  { key: 'sheltered', label: 'Sheltered' },
  { key: 'shaded', label: 'Shaded' },
  { key: 'step_free', label: 'Step-free' },
] as const;
export type RouteMode = (typeof ROUTE_MODES)[number]['key'];

/** Id of the standard (provider) route option; community options use their route id. */
export const STANDARD_OPTION_ID = 'standard';

export function PlanningSheet({
  origin,
  destination,
  onPickOrigin,
  onPickDestination,
  onSwap,
  onClose,
  mode,
  onModeChange,
  standardRoute,
  isLoading,
  error,
  onRetry,
  selectedOptionId,
  onSelectOption,
}: {
  origin: Place | null;
  destination: Place | null;
  onPickOrigin: () => void;
  onPickDestination: () => void;
  onSwap: () => void;
  onClose: () => void;
  mode: RouteMode;
  onModeChange: (mode: RouteMode) => void;
  standardRoute: PlanRouteResponse | undefined;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  selectedOptionId: string | null;
  onSelectOption: (id: string) => void;
}) {
  const t = useAppTheme();
  const ready = origin !== null && destination !== null;
  const modeLabel = ROUTE_MODES.find((m) => m.key === mode)!.label.toLowerCase();

  return (
    <View style={styles.container}>
      {/* From / To */}
      <View style={[styles.fieldsCard, { backgroundColor: t.surface }]}>
        <View style={styles.fields}>
          <PlaceField
            dotColor={t.primary}
            label="From"
            place={origin}
            placeholder="Choose start"
            onPress={onPickOrigin}
          />
          <View style={[styles.divider, { backgroundColor: t.border }]} />
          <PlaceField
            dotColor={t.danger}
            label="To"
            place={destination}
            placeholder="Choose destination"
            onPress={onPickDestination}
          />
        </View>
        <View style={styles.fieldButtons}>
          <IconButton icon="close" label="Close route planning" onPress={onClose} />
          <IconButton icon="swap-vertical" label="Swap start and destination" onPress={onSwap} />
        </View>
      </View>

      <SegmentedTabs options={ROUTE_MODES} value={mode} onChange={onModeChange} />

      {!ready ? (
        <Text style={[type.small, { color: t.textSecondary }]}>
          Choose a start and a destination to see route options.
        </Text>
      ) : null}

      {ready && mode !== 'fastest' ? (
        <View style={[styles.note, { backgroundColor: t.surface }]}>
          <Icon name="information-outline" size={20} color={t.textSecondary} />
          <Text style={[type.small, styles.flex1, { color: t.textSecondary }]}>
            No {modeLabel} community route covers this trip yet. They appear here once walkers log
            and describe one. The standard walking route is below
            {mode === 'step_free' ? ' — its accessibility is not confirmed' : ''}.
          </Text>
        </View>
      ) : null}

      {ready && isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator />
          <Text style={[type.small, { color: t.textSecondary }]}>Finding routes…</Text>
        </View>
      ) : null}
      {ready && error ? (
        <ErrorCard title="Couldn’t get a route" message={error.message} onRetry={onRetry} />
      ) : null}

      {ready && standardRoute ? (
        <RouteOptionCard
          option={{
            id: STANDARD_OPTION_ID,
            title: 'Standard walking route (street map)',
            durationS: standardRoute.duration_s,
            distanceM: standardRoute.distance_m,
            segments: buildSegments([]), // no checkpoints → outdoor only
            tags: [],
            color: t.routeStandard,
            verified: null,
            notes: mode === 'step_free' ? ['Step-free not confirmed'] : undefined,
          }}
          selected={selectedOptionId === STANDARD_OPTION_ID}
          onPress={() => onSelectOption(STANDARD_OPTION_ID)}
        />
      ) : null}

      {ready && standardRoute && selectedOptionId === STANDARD_OPTION_ID ? (
        <DirectionsList steps={standardRoute.steps ?? []} provider={standardRoute.provider} />
      ) : null}
    </View>
  );
}

function PlaceField({
  dotColor,
  label,
  place,
  placeholder,
  onPress,
}: {
  dotColor: string;
  label: string;
  place: Place | null;
  placeholder: string;
  onPress: () => void;
}) {
  const t = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${place?.label ?? placeholder}`}
      onPress={onPress}
      style={styles.field}
    >
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text
        style={[type.body, styles.flex1, { color: place ? t.textPrimary : t.textSecondary }]}
        numberOfLines={1}
      >
        {place?.label ?? placeholder}
      </Text>
    </Pressable>
  );
}

function IconButton({
  icon,
  label,
  onPress,
}: {
  icon: 'close' | 'swap-vertical';
  label: string;
  onPress: () => void;
}) {
  const t = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.iconButton}
      hitSlop={4}
    >
      <Icon name={icon} size={22} color={t.textPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.xl },
  flex1: { flex: 1 },
  fieldsCard: { flexDirection: 'row', borderRadius: radius.md, paddingLeft: space.md },
  fields: { flex: 1 },
  field: { minHeight: TAP_TARGET + 4, flexDirection: 'row', alignItems: 'center', gap: space.md },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 22 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  fieldButtons: { justifyContent: 'space-between' },
  iconButton: {
    width: TAP_TARGET,
    height: TAP_TARGET + 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.md },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.md,
  },
});
