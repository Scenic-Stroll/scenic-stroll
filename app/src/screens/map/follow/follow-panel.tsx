/**
 * Bottom sheet while walking a route: messages (re-planned, weather changed), the current
 * instruction and the next one, time left and arrival time, "Report blocked path ahead" and Stop.
 * With the demo walker on, also "Step off route" and "Make it rain" to show re-routing on stage.
 */
import {
  formatDistance,
  formatDuration,
  formatHkTime,
  OFF_ROUTE_S,
  remainingSeconds,
  stepIndexAt,
} from '@scenic/shared';
import { StyleSheet, Text, View } from 'react-native';

import { iconFor } from '@/components/route/directions-list';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { PrimaryButton } from '@/components/ui/primary-button';
import { useConditionsUi } from '@/lib/conditions';
import { useFollow, useFollowDemo, type FollowSession } from '@/lib/follow-store';
import { radius, space, type, useAppTheme } from '@/theme';

import { FollowBanner } from './follow-banner';

export function FollowPanel({ onRecentre }: { onRecentre: () => void }) {
  const t = useAppTheme();
  const s = useFollow((st) => st.session);
  const actions = useFollow((st) => st.actions);
  const patch = useFollow((st) => st.patch);
  const stop = useFollow((st) => st.stop);
  const simulate = useFollowDemo((d) => d.simulateWalk);
  const simulated = useConditionsUi((c) => c.simulated);
  const setSimulated = useConditionsUi((c) => c.setSimulated);
  if (!s) return null;

  if (s.arrived) {
    return (
      <View style={styles.container}>
        <View style={[styles.arrived, { backgroundColor: t.successSurface }]}>
          <Icon name="flag-checkered" size={28} color={t.primary} />
          <Text style={[type.title, styles.flex1, { color: t.textPrimary }]}>
            You’ve arrived at {s.destinationLabel}
          </Text>
        </View>
        <PrimaryButton label="Done" icon="check" onPress={stop} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {s.banner ? (
        <FollowBanner
          banner={s.banner}
          onSwitch={() => actions?.acceptSwitch()}
          onUndo={() => actions?.undoReport()}
          onDismiss={() => patch({ banner: null })}
        />
      ) : null}
      <OffRouteLine session={s} />
      <CurrentStep session={s} />
      <Summary session={s} />

      {!s.followCamera ? (
        <View style={styles.chips}>
          <Chip small icon="crosshairs-gps" label="Re-centre map" onPress={onRecentre} />
        </View>
      ) : null}

      <PrimaryButton
        label="Report blocked path ahead"
        icon="traffic-cone"
        variant="secondary"
        disabled={s.replanning}
        accessibilityHint="Tells other walkers for 3 hours and finds you a way around"
        onPress={() => actions?.reportBlockedAhead()}
      />
      <PrimaryButton label="Stop" icon="stop" variant="danger" onPress={stop} />

      {simulate ? (
        <View style={styles.demo}>
          <Text style={[type.caption, { color: t.textSecondary }]}>Demo (simulated walk)</Text>
          <View style={styles.chips}>
            <Chip small label="Step off route" onPress={() => actions?.stepOffRoute()} />
            <Chip
              small
              label={simulated === 'rain' ? 'Stop the rain' : 'Make it rain'}
              selected={simulated === 'rain'}
              onPress={() => setSimulated(simulated === 'rain' ? null : 'rain')}
            />
            <Chip
              small
              label="Make it hot"
              selected={simulated === 'heat'}
              onPress={() => setSimulated(simulated === 'heat' ? null : 'heat')}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** "Off route — re-planning in 12 s" / "Finding a new route…" */
function OffRouteLine({ session: s }: { session: FollowSession }) {
  const t = useAppTheme();
  if (!s.replanning && s.secondsOff <= 0) return null;
  const text = s.replanning
    ? 'Finding a new route…'
    : `Off route — re-planning in ${Math.max(0, OFF_ROUTE_S - s.secondsOff)} s`;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.offRoute, { backgroundColor: t.warningSurface }]}
    >
      <Icon name="map-marker-alert-outline" size={18} color={t.warning} />
      <Text style={[type.small, { color: t.textPrimary }]}>{text}</Text>
    </View>
  );
}

function CurrentStep({ session: s }: { session: FollowSession }) {
  const t = useAppTheme();
  const steps = s.route.steps;
  if (steps.length === 0) {
    return <Text style={[type.body, { color: t.textPrimary }]}>Follow the line on the map.</Text>;
  }
  const alongM = s.position?.alongM ?? 0;
  const i = stepIndexAt(steps, alongM);
  const step = steps[i]!;
  const next = steps[i + 1];
  const stepEnd = steps.slice(0, i + 1).reduce((sum, x) => sum + x.distance_m, 0);
  return (
    <View style={styles.step} accessibilityLiveRegion="polite">
      <View style={[styles.stepIcon, { backgroundColor: t.primary }]}>
        <Icon name={iconFor(step.instruction)} size={28} color={t.onPrimary} />
      </View>
      <View style={styles.flex1}>
        <Text style={[type.title, { color: t.textPrimary }]}>{step.instruction}</Text>
        {step.distance_m > 0 ? (
          <Text style={[type.small, { color: t.textSecondary }]}>
            {formatDistance(Math.max(0, stepEnd - alongM))}
          </Text>
        ) : null}
        {next ? (
          <Text style={[type.small, { color: t.textSecondary }]}>Then: {next.instruction}</Text>
        ) : null}
      </View>
    </View>
  );
}

/** "4 min · 320 m · arrive 13:06", plus a closing warning if one is ahead. */
function Summary({ session: s }: { session: FollowSession }) {
  const t = useAppTheme();
  const leftS = s.position ? remainingSeconds(s.route.duration_s, s.position) : s.route.duration_s;
  const leftM = s.position
    ? Math.max(0, s.position.totalM - s.position.alongM)
    : s.route.distance_m;
  const closing = s.route.closing[0];
  return (
    <View style={styles.summary}>
      <Text style={[type.body, { color: t.textPrimary }]}>
        {formatDuration(leftS)} · {formatDistance(leftM)}
        {s.arriveAt ? ` · arrive ${formatHkTime(s.arriveAt)}` : ''}
      </Text>
      <Text style={[type.caption, { color: t.textSecondary }]}>
        {s.route.title} to {s.destinationLabel}
      </Text>
      {closing ? (
        <Text style={[type.caption, { color: t.warning }]}>
          {closing.name ?? 'An indoor link'} closes at {formatHkTime(closing.closes_at)} — keep
          going
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.xl },
  flex1: { flex: 1 },
  arrived: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.md,
  },
  offRoute: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.md,
  },
  step: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  stepIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: { gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  demo: { gap: space.xs },
});
