/**
 * One route option in the planning sheet: big duration, distance, segment strip, tag chips,
 * verified badge, contributors and last-confirmed date. Used for the standard route now and for
 * community routes once find-routes exists (Phase 4).
 */
import { formatDistance, formatDuration, TAXONOMY, isTag, type SegmentKind } from '@scenic/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { radius, space, type, useAppTheme } from '@/theme';

import { SegmentStrip } from './segment-strip';

export type RouteOption = {
  id: string;
  title: string;
  durationS: number;
  distanceM: number;
  segments: SegmentKind[];
  tags: string[];
  /** Line colour on the map (community green, standard grey, step-free blue). */
  color: string;
  /** null = not a community route (no verification concept). */
  verified: boolean | null;
  contributors?: number;
  lastConfirmedAt?: string | null;
  /** Extra caution chips, e.g. "Step-free not confirmed". */
  notes?: string[];
};

function daysAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export function RouteOptionCard({
  option,
  selected,
  onPress,
}: {
  option: RouteOption;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useAppTheme();
  const tags = option.tags.filter(isTag);
  const meta = [
    option.contributors
      ? `${option.contributors} contributor${option.contributors === 1 ? '' : 's'}`
      : null,
    option.lastConfirmedAt ? `confirmed ${daysAgo(option.lastConfirmedAt)}` : null,
  ].filter(Boolean);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${option.title}, ${formatDuration(option.durationS)}, ${formatDistance(option.distanceM)}`}
      accessibilityHint="Shows the route on the map and step-by-step directions"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          borderColor: selected ? t.primary : t.border,
          backgroundColor: pressed ? t.surface : t.background,
        },
      ]}
    >
      <View style={styles.top}>
        <Text style={[type.heading, { color: t.textPrimary }]}>
          {formatDuration(option.durationS)}
        </Text>
        <Text style={[type.body, { color: t.textSecondary }]}>
          {formatDistance(option.distanceM)}
        </Text>
        <View style={styles.flex1} />
        {option.verified === true ? (
          <Chip small icon="check-decagram" label="Verified" selected />
        ) : null}
        {option.verified === false ? <Chip small icon="clock-outline" label="Unverified" /> : null}
      </View>

      <View style={styles.titleRow}>
        <View style={[styles.legend, { backgroundColor: option.color }]} />
        <Text style={[type.small, styles.flex1, { color: t.textPrimary }]} numberOfLines={1}>
          {option.title}
        </Text>
      </View>

      <SegmentStrip segments={option.segments} />

      {tags.length > 0 || option.notes?.length ? (
        <View style={styles.chips}>
          {tags.map((tag) => (
            <Chip key={tag} small label={TAXONOMY[tag].en} />
          ))}
          {option.notes?.map((note) => (
            <Chip key={note} small icon="help-circle-outline" label={note} />
          ))}
        </View>
      ) : null}

      {meta.length > 0 ? (
        <Text style={[type.caption, { color: t.textSecondary }]}>{meta.join(' · ')}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 2, borderRadius: radius.md, padding: space.lg, gap: space.sm },
  top: { flexDirection: 'row', alignItems: 'baseline', gap: space.md },
  flex1: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  legend: { width: 24, height: 5, borderRadius: 3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
