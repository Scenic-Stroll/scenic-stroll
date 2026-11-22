// Profile → points (adults only; under-18s see badges, D52/D55): the balance, today's points and
// the daily ring — steps today out of 10,000, worked out from recorded walking distance.
// Points can't be bought, cashed out or transferred.
import { POINTS_RULES, ringProgress, stepsFromMeters } from '@scenic/shared';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { usePointsSummary } from '@/lib/points';
import { radius, space, type, useAppTheme } from '@/theme';

const SIZE = 96;
const STROKE = 10;

export function PointsCard() {
  const t = useAppTheme();
  const summary = usePointsSummary();
  if (summary.isPending) return <ActivityIndicator />;
  if (!summary.data) return null;
  const { balance, todayPoints, todayMeters, earlierPoints } = summary.data;
  const steps = Math.floor(stepsFromMeters(todayMeters));
  const progress = ringProgress(steps);
  const r = (SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <View style={[styles.card, { backgroundColor: t.surface }]}>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`Today: about ${steps.toLocaleString('en-HK')} of ${POINTS_RULES.dailyStepGoal.toLocaleString('en-HK')} steps, estimated from distance`}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
      >
        <Svg width={SIZE} height={SIZE}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={r}
            stroke={t.border}
            strokeWidth={STROKE}
            fill="none"
          />
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={r}
            stroke={t.accent}
            strokeWidth={STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference * progress} ${circumference}`}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        </Svg>
        <View style={styles.ringLabel} pointerEvents="none">
          <Text style={[type.title, { color: t.textPrimary }]}>{(steps / 1000).toFixed(1)}k</Text>
          <Text style={[type.caption, { color: t.textSecondary }]}>steps</Text>
        </View>
      </View>
      <View style={styles.flex}>
        <Text style={[type.heading, { color: t.textPrimary }]}>
          {balance.toLocaleString('en-HK')} points
        </Text>
        <Text style={[type.small, { color: t.textPrimary }]}>Today: +{todayPoints}</Text>
        <Text style={[type.caption, { color: t.textSecondary }]}>
          Steps estimated from distance (0.75 km ≈ 1,000 steps) on recorded walks · goal{' '}
          {POINTS_RULES.dailyStepGoal.toLocaleString('en-HK')} a day
        </Text>
        {earlierPoints > 0 ? (
          <Text style={[type.caption, { color: t.textSecondary }]}>
            + {earlierPoints} earlier points (old rules, before 24 Nov 2026)
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    padding: space.lg,
    borderRadius: radius.md,
  },
  ringLabel: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: 2 },
});
