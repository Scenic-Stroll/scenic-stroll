/**
 * Step-by-step directions for the selected route option.
 * Standard routes get the routing provider's turn instructions; computed smart routes get ours
 * from the walking graph ("Take the escalator up", "Go through the subway"); community routes will
 * add checkpoint instructions in Phase 4.
 */
import { formatDistance, type RouteStep } from '@scenic/shared';
import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { radius, space, type, useAppTheme } from '@/theme';

/** Picks an arrow icon from the instruction text (works for ORS and Google wording). */
export function iconFor(instruction: string): IconName {
  const s = instruction.toLowerCase();
  if (s.startsWith('arrive') || s.includes('destination')) return 'flag-checkered';
  if (s.includes('lift')) return 'elevator';
  if (s.includes('escalator')) return 'escalator';
  if (s.includes('stairs')) return 'stairs';
  if (s.includes('footbridge')) return 'bridge';
  if (s.includes('subway')) return 'tunnel';
  if (s.includes('indoors')) return 'office-building';
  if (
    s.includes('sharp left') ||
    s.includes('slight left') ||
    s.includes('turn left') ||
    s.includes('keep left')
  )
    return 'arrow-top-left';
  if (
    s.includes('sharp right') ||
    s.includes('slight right') ||
    s.includes('turn right') ||
    s.includes('keep right')
  )
    return 'arrow-top-right';
  if (s.includes('u-turn')) return 'arrow-u-down-left';
  return 'arrow-up';
}

export function DirectionsList({
  steps,
  provider,
}: {
  steps: readonly RouteStep[];
  provider: string;
}) {
  const t = useAppTheme();
  if (steps.length === 0) {
    return (
      <Text style={[type.small, { color: t.textSecondary }]}>
        No step-by-step directions for this route. Follow the line on the map.
      </Text>
    );
  }
  return (
    <View style={styles.list} accessibilityRole="list">
      <Text style={[type.title, { color: t.textPrimary }]} accessibilityRole="header">
        Directions
      </Text>
      {steps.map((step, i) => (
        <View
          key={i}
          style={[styles.step, { borderColor: t.border }]}
          accessible
          accessibilityLabel={`Step ${i + 1}: ${step.instruction}${step.distance_m > 0 ? `, ${formatDistance(step.distance_m)}` : ''}`}
        >
          <View style={[styles.iconBox, { backgroundColor: t.surface }]}>
            <Icon name={iconFor(step.instruction)} size={20} color={t.textPrimary} />
          </View>
          <Text style={[type.body, styles.flex1, { color: t.textPrimary }]}>
            {step.instruction}
          </Text>
          {step.distance_m > 0 ? (
            <Text style={[type.small, { color: t.textSecondary }]}>
              {formatDistance(step.distance_m)}
            </Text>
          ) : null}
        </View>
      ))}
      <Text style={[type.caption, { color: t.textSecondary }]}>
        {provider === 'walking-graph'
          ? 'Computed from the Lands Department 3D Pedestrian Network. Follow the signs on the way — lifts and passages can close.'
          : `Street directions from ${provider === 'google' ? 'Google' : 'OpenRouteService'} — they don’t know about lifts, malls or floors. Community routes add those.`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex1: { flex: 1 },
});
