/**
 * Bottom sheet, route planning state: the "Now" conditions card, From / To, what to prefer (Best now ·
 * Fastest · Shaded · Sheltered · Cool · Step-free), when you leave, and the route options: our
 * computed smart routes first, then the standard street route as a baseline. If smart routing isn't
 * available (offline, outside the area) only the standard route shows. Community routes: Phase 4.
 */
import {
  buildSegments,
  type ConditionMode,
  type Conditions,
  type PlanRouteResponse,
  type SmartRouteResponse,
} from '@scenic/shared';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { DirectionsList } from '@/components/route/directions-list';
import { RouteOptionCard } from '@/components/route/route-option-card';
import { ErrorCard } from '@/components/ui/error-card';
import { Icon } from '@/components/ui/icon';
import { radius, space, TAP_TARGET, type, useAppTheme } from '@/theme';

import { ConditionsCard } from './conditions-card';
import { DeparturePicker } from './departure-picker';
import { RouteModeTabs, type RouteMode } from './route-mode-tabs';
import { SmartRouteOptions } from './smart-route-options';
import type { Place } from './types';

/** What the "Now" card needs (comes from useConditions()). */
export type NowInfo = {
  conditions: Conditions | null;
  mode: ConditionMode;
  isOverridden: boolean;
  isSimulated: boolean;
};

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
  departure,
  onDepartureChange,
  standardRoute,
  isLoading,
  error,
  onRetry,
  selectedOptionId,
  onSelectOption,
  now,
  onConditionOverride,
  smart,
  smartLoading,
}: {
  origin: Place | null;
  destination: Place | null;
  onPickOrigin: () => void;
  onPickDestination: () => void;
  onSwap: () => void;
  onClose: () => void;
  mode: RouteMode;
  onModeChange: (mode: RouteMode) => void;
  /** null = leave now. */
  departure: Date | null;
  onDepartureChange: (when: Date | null) => void;
  standardRoute: PlanRouteResponse | undefined;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  selectedOptionId: string | null;
  onSelectOption: (id: string) => void;
  now: NowInfo;
  onConditionOverride: (mode: ConditionMode | null) => void;
  /** Computed routes; null/undefined = not available (the standard route is still shown). */
  smart: SmartRouteResponse | null | undefined;
  smartLoading: boolean;
}) {
  const t = useAppTheme();
  const ready = origin !== null && destination !== null;
  const smartOptions = smart?.status === 'ok' ? smart.options : [];
  const stepFreeMissing = mode === 'step_free' && smart?.unavailable.includes('step_free');

  return (
    <View style={styles.container}>
      {now.conditions ? (
        <ConditionsCard
          conditions={now.conditions}
          mode={now.mode}
          isOverridden={now.isOverridden}
          isSimulated={now.isSimulated}
          onOverride={onConditionOverride}
        />
      ) : null}

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

      <RouteModeTabs value={mode} onChange={onModeChange} />
      <DeparturePicker value={departure} onChange={onDepartureChange} />

      {!ready ? (
        <Text style={[type.small, { color: t.textSecondary }]}>
          Choose a start and a destination to see route options.
        </Text>
      ) : null}

      {ready && smart?.status === 'outside_area' ? (
        <Note text="Computed routes cover Kowloon Tong, Festival Walk and CityU. Outside that, only the standard street route is shown." />
      ) : null}
      {ready && stepFreeMissing ? (
        <Note text="No step-free way was found in the map data for this trip. The routes below include stairs or escalators." />
      ) : null}

      {ready && (isLoading || smartLoading) ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator />
          <Text style={[type.small, { color: t.textSecondary }]}>Finding routes…</Text>
        </View>
      ) : null}
      {ready && error ? (
        <ErrorCard title="Couldn’t get a route" message={error.message} onRetry={onRetry} />
      ) : null}

      {ready ? (
        <SmartRouteOptions
          options={smartOptions}
          selectedId={selectedOptionId}
          onSelect={onSelectOption}
        />
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

function Note({ text }: { text: string }) {
  const t = useAppTheme();
  return (
    <View style={[styles.note, { backgroundColor: t.surface }]}>
      <Icon name="information-outline" size={20} color={t.textSecondary} />
      <Text style={[type.small, styles.flex1, { color: t.textSecondary }]}>{text}</Text>
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
