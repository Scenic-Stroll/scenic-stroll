/**
 * Our computed route options (smart-route) in the planning sheet: one card per option, labelled
 * "Computed" with its facts (% covered, step-free…), and for the chosen one the explanation and
 * step-by-step directions. Every claim on screen comes from the route's facts — nothing is guessed.
 */
import { PROFILE_LABELS, type SmartRouteOption } from '@scenic/shared';
import { StyleSheet, Text, View } from 'react-native';

import { DirectionsList } from '@/components/route/directions-list';
import { RouteOptionCard, type RouteOption } from '@/components/route/route-option-card';
import { Icon } from '@/components/ui/icon';
import { radius, space, type, useAppTheme } from '@/theme';

/** "Sheltered route · Best now", "Fastest route". */
function titleOf(o: SmartRouteOption): string {
  const name = `${PROFILE_LABELS[o.profile].en} route`;
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
        />
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
                {selected.estimated.includes('air_conditioned')
                  ? ' · air-conditioning is estimated for indoor walkways'
                  : ''}
                {' · not yet confirmed by walkers'}
              </Text>
            </View>
          </View>
          <DirectionsList steps={selected.steps} provider="walking-graph" />
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  explain: { flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.md },
});
