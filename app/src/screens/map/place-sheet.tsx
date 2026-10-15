/**
 * Bottom sheet, place state: shown when a landmark pin, a search result or a dropped pin is tapped.
 * Name, type, nearest MTR exits, community info, and Route here / Route from here / Save / Share.
 */
import {
  formatDistance,
  haversineMeters,
  nearestPresets,
  PRESET_KIND_TYPE,
  PRESETS,
  TAXONOMY,
  isTag,
  type CommunityRoute,
} from '@scenic/shared';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { Icon, type IconName } from '@/components/ui/icon';
import { PrimaryButton } from '@/components/ui/primary-button';
import { useSavedPlaces } from '@/lib/saved-places-store';
import { radius, space, TAP_TARGET, type, useAppTheme } from '@/theme';

import { placeId, type Place } from './types';

/** Community routes that end within this distance count as "routes to this place". */
const ARRIVING_METERS = 100;

export function PlaceSheet({
  place,
  communityRoutes,
  onRouteHere,
  onRouteFrom,
  onClose,
  onSelectRoute,
}: {
  place: Place;
  communityRoutes: CommunityRoute[];
  onRouteHere: () => void;
  onRouteFrom: () => void;
  onClose: () => void;
  onSelectRoute: (route: CommunityRoute) => void;
}) {
  const t = useAppTheme();
  const preset = place.presetId ? PRESETS.find((p) => p.id === place.presetId) : undefined;
  const id = placeId(place);
  const saved = useSavedPlaces((s) => s.places.some((p) => p.id === id));
  const toggleSaved = useSavedPlaces((s) => s.toggle);

  const typeLabel = preset
    ? `${PRESET_KIND_TYPE[preset.kind].en} · ${PRESET_KIND_TYPE[preset.kind].zh}`
    : place.label === 'Dropped pin'
      ? 'Dropped pin'
      : 'Place';
  const exits =
    preset?.kind === 'mtr_exit' ? [] : nearestPresets(place.point, { kind: 'mtr_exit', limit: 3 });
  const arriving = communityRoutes.filter(
    (r) => haversineMeters(r.line.at(-1)!, place.point) <= ARRIVING_METERS,
  );
  const tags = [...new Set(arriving.flatMap((r) => r.tags))].filter(isTag);

  const share = () =>
    Share.share({
      message: `${place.label} — https://www.openstreetmap.org/?mlat=${place.point.lat.toFixed(6)}&mlon=${place.point.lng.toFixed(6)}#map=19/${place.point.lat.toFixed(6)}/${place.point.lng.toFixed(6)}`,
    }).catch(() => undefined);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.flex1}>
          <Text style={[type.heading, { color: t.textPrimary }]} accessibilityRole="header">
            {place.label}
          </Text>
          {preset ? <Text style={[type.body, { color: t.textSecondary }]}>{preset.zh}</Text> : null}
          <Text style={[type.small, { color: t.textSecondary }]}>{typeLabel}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close place"
          onPress={onClose}
          hitSlop={8}
          style={[styles.close, { backgroundColor: t.surface }]}
        >
          <Icon name="close" size={20} color={t.textPrimary} />
        </Pressable>
      </View>

      {/* Actions */}
      <PrimaryButton label="Route here" icon="directions" onPress={onRouteHere} />
      <View style={styles.actions}>
        <Action icon="map-marker-radius-outline" label="Route from here" onPress={onRouteFrom} />
        <Action
          icon={saved ? 'bookmark' : 'bookmark-outline'}
          label={saved ? 'Saved' : 'Save'}
          selected={saved}
          onPress={() =>
            toggleSaved({ id, label: place.label, point: place.point, presetId: place.presetId })
          }
        />
        <Action icon="share-variant-outline" label="Share" onPress={() => void share()} />
      </View>

      {/* Nearest MTR exits */}
      {exits.length > 0 ? (
        <Section title="Nearest MTR exits">
          {exits.map(({ preset: exit, distanceM }) => (
            <View key={exit.id} style={styles.infoRow}>
              <Icon name="subway-variant" size={20} color={t.textSecondary} />
              <Text style={[type.body, styles.flex1, { color: t.textPrimary }]}>{exit.en}</Text>
              <Text style={[type.small, { color: t.textSecondary }]}>
                ~{formatDistance(distanceM)}
              </Text>
            </View>
          ))}
          <Text style={[type.caption, { color: t.textSecondary }]}>Straight-line distance.</Text>
        </Section>
      ) : null}

      {/* Floors & entrances — only community checkpoints can tell us this */}
      <Section title="Floors & entrances">
        <Text style={[type.small, { color: t.textSecondary }]}>
          No floor or entrance info yet. Record a route here and add lift, escalator and entrance
          checkpoints — that’s how floors get mapped.
        </Text>
      </Section>

      {/* Community */}
      <Section title="Community routes to here">
        {arriving.length === 0 ? (
          <Text style={[type.small, { color: t.textSecondary }]}>
            No community routes end here yet.
          </Text>
        ) : (
          arriving.map((r) => (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              accessibilityLabel={`Show ${r.title} on the map`}
              onPress={() => onSelectRoute(r)}
              style={styles.infoRow}
            >
              <Icon name="map-marker-path" size={20} color={t.accent} />
              <Text style={[type.body, styles.flex1, { color: t.textPrimary }]} numberOfLines={1}>
                {r.title}
              </Text>
              <Icon name="chevron-right" size={20} color={t.textSecondary} />
            </Pressable>
          ))
        )}
        {tags.length > 0 ? (
          <View style={styles.chips}>
            {tags.map((tag) => (
              <Chip key={tag} small label={TAXONOMY[tag].en} />
            ))}
          </View>
        ) : null}
      </Section>

      <Section title="Photos">
        <View style={[styles.photoPlaceholder, { backgroundColor: t.surface }]}>
          <Icon name="image-outline" size={28} color={t.textSecondary} />
          <Text style={[type.small, { color: t.textSecondary }]}>No photos yet</Text>
        </View>
      </Section>
    </View>
  );
}

function Action({
  icon,
  label,
  onPress,
  selected = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  selected?: boolean;
}) {
  const t = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: pressed ? t.surfacePressed : t.surface },
      ]}
    >
      <Icon name={icon} size={22} color={selected ? t.primary : t.textPrimary} />
      <Text style={[type.caption, { color: t.textPrimary }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useAppTheme();
  return (
    <View style={styles.section}>
      <Text
        style={[type.body, { color: t.textPrimary, fontWeight: '600' }]}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.lg, paddingHorizontal: space.lg, paddingBottom: space.xl },
  flex1: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  close: {
    width: TAP_TARGET - 8,
    height: TAP_TARGET - 8,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', gap: space.sm },
  action: {
    flex: 1,
    minHeight: TAP_TARGET + 12,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: space.xs,
  },
  section: { gap: space.sm },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: TAP_TARGET },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  photoPlaceholder: {
    height: 96,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
});
