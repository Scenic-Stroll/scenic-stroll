/**
 * Our computed route options (smart-route) in the planning sheet: one card per option, labelled
 * "Computed" with its facts (% covered, % shaded, step-free…) and an exposure bar (sun / shade /
 * covered / indoors); for the chosen one the explanation, the map colour legend and step-by-step
 * directions. Every claim on screen comes from the route's facts — nothing is guessed.
 */
import { formatHkTime, PROFILE_LABELS, type SmartRouteOption } from '@scenic/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DirectionsList } from '@/components/route/directions-list';
import { ExposureBar } from '@/components/route/exposure-bar';
import { RUN_LABELS, runColor } from '@/components/route/route-colors';
import { RouteOptionCard, type RouteOption } from '@/components/route/route-option-card';
import { Icon } from '@/components/ui/icon';
import { radius, space, type, useAppTheme } from '@/theme';

/** "Sheltered route · Best now", "Fastest route". */
function titleOf(o: SmartRouteOption): string {
  const name = `${PROFILE_LABELS[o.profile].en} route`;
  if (o.roles.includes('alternative')) return `${name} · another way`;
  if (o.roles.includes('best_now') && o.profile !== 'fastest') return `${name} · Best now`;
  if (o.roles.includes('fastest') && o.profile !== 'fastest') return `${name} · also the fastest`;
  return name;
}

/** Fact chips, conservative wording: "Step-free" only when every part is known to be. */
function badgesOf(o: SmartRouteOption): RouteOption['badges'] {
  const badges: NonNullable<RouteOption['badges']> = [
    { label: 'Computed', icon: 'map-marker-path' },
    { label: `${o.pct_covered}% covered`, icon: 'umbrella-outline' },
  ];
  // Only claimed while the sun is up and shade is computed (pct_shaded is null otherwise).
  if (o.pct_shaded !== null)
    badges.push({ label: `${o.pct_shaded}% shaded`, icon: 'weather-sunny-off' });
  if (o.step_free === 'yes') badges.push({ label: 'Step-free', icon: 'wheelchair-accessibility' });
  if (o.lifts > 0)
    badges.push({ label: `${o.lifts} lift${o.lifts > 1 ? 's' : ''}`, icon: 'elevator' });
  return badges;
}

function notesOf(o: SmartRouteOption): string[] {
  const notes: string[] = [];
  if (o.step_free === 'unconfirmed') notes.push('Step-free unconfirmed');
  if (o.stairs > 0) notes.push(`${o.stairs}× stairs`);
  if (o.much_longer) notes.push('Much longer');
  // Indoor links that close soon after you'd reach them (the explanation has the details).
  const closing = o.closing[0];
  if (closing) {
    notes.push(`${closing.name ?? 'Indoor link'} closes ${formatHkTime(closing.closes_at)}`);
  }
  if (o.avoids_closing) notes.push('Avoids a closing indoor link');
  return notes;
}

export function SmartRouteOptions({
  options,
  selectedId,
  onSelect,
}: {
  options: SmartRouteOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useAppTheme();
  const selected = options.find((o) => o.id === selectedId) ?? null;
  const [legendOpen, setLegendOpen] = useState(false);

  return (
    <>
      {options.map((o) => (
        <RouteOptionCard
          key={o.id}
          option={{
            id: o.id,
            title: titleOf(o),
            durationS: o.duration_s,
            distanceM: o.distance_m,
            segments: o.segments,
            tags: [],
            color: t.primary,
            verified: null,
            badges: badgesOf(o),
            notes: notesOf(o),
          }}
          selected={o.id === selectedId}
          onPress={() => onSelect(o.id)}
        >
          <ExposureBar exposure={o.exposure} />
        </RouteOptionCard>
      ))}

      {selected ? (
        <>
          <View style={[styles.explain, { backgroundColor: t.surface }]}>
            <Icon name="information-outline" size={20} color={t.textSecondary} />
            <View style={styles.flex1}>
              <Text style={[type.small, { color: t.textPrimary }]}>
                {selected.explanation.text}
              </Text>
              <Text style={[type.caption, { color: t.textSecondary }]}>
                Computed from map data
                {selected.estimated.includes('shade')
                  ? ' · estimated shade, based on building heights, trees and the sun’s position'
                  : ''}
                {selected.estimated.includes('air_conditioned')
                  ? ' · air-conditioning is estimated for indoor walkways'
                  : ''}
                {' · not yet confirmed by walkers'}
              </Text>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: legendOpen }}
            onPress={() => setLegendOpen((v) => !v)}
            style={styles.legendToggle}
            hitSlop={8}
          >
            <Icon name="map-legend" size={18} color={t.textSecondary} />
            <Text style={[type.small, { color: t.textSecondary }]}>
              {legendOpen ? 'Hide map colours' : 'What do the map colours mean?'}
            </Text>
          </Pressable>
          {legendOpen ? (
            <View style={styles.legend} accessibilityRole="list">
              {(['sun', 'shade', 'covered', 'indoor', 'open'] as const).map((k) => (
                <View key={k} style={styles.legendItem}>
                  <View style={[styles.swatch, { backgroundColor: runColor(k, t) }]} />
                  <Text style={[type.caption, { color: t.textPrimary }]}>
                    {k === 'open' ? 'Outdoors (after dark / not known)' : RUN_LABELS[k]}
                  </Text>
                </View>
              ))}
              <View style={styles.legendItem}>
                <View style={[styles.dotSwatch, { backgroundColor: t.routeStairs }]} />
                <Text style={[type.caption, { color: t.textPrimary }]}>Stairs</Text>
              </View>
              <View style={styles.legendItem}>
                <Icon name="elevator" size={14} color={t.routeIndoor} />
                <Text style={[type.caption, { color: t.textPrimary }]}>Lift / escalator</Text>
              </View>
            </View>
          ) : null}
          <DirectionsList steps={selected.steps} provider="walking-graph" />
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  explain: { flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.md },
  legendToggle: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 44 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  swatch: { width: 18, height: 5, borderRadius: 3 },
  dotSwatch: { width: 8, height: 8, borderRadius: 4 },
});
