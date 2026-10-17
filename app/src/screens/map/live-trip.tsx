/**
 * Live trip updates on the trip cards (multimodal step 6):
 *   * LiveTransit — on the selected transit card: re-checks the boarding stop every 30 s and says
 *     when to leave ("Leave in 4 min for the 08:27 KTL"), or that you'd miss the next one. Buzzes
 *     once when it's time to go.
 *   * RerouteBanner — above the list: after a traffic refresh, a car/taxi route that now saves
 *     ≥ 3 min over the one you picked, with a Switch button.
 * Both say how fresh the data is and fall back to the plan's estimate, never to made-up times.
 */
import {
  arrivalsForLeg,
  catchMessage,
  catchPlan,
  formatDuration,
  type TripOption,
} from '@scenic/shared';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, Vibration, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { useStopEta } from '@/lib/stop-eta';
import { radius, space, TAP_TARGET, type, useAppTheme } from '@/theme';

/** Re-draw this often so "Leave in 4 min" counts down between 30 s refreshes. */
const TICK_MS = 10_000;
/** Same window plan-trip uses for live departures. */
const LIVE_WINDOW_MS = 20 * 60_000;

function useNow(everyMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

export function LiveTransit({ option }: { option: TripOption }) {
  const t = useAppTheme();
  const now = useNow(TICK_MS);
  const i = option.legs.findIndex((l) => l.mode === 'transit');
  const leg = option.legs[i];
  const eta = useStopEta(leg?.boarding?.stop_id ?? null);
  // Walking time to the stop = every leg before the first ride (as planned).
  const walkS =
    i > 0
      ? (Date.parse(option.legs[i - 1]!.arrive_at) - Date.parse(option.legs[0]!.depart_at)) / 1000
      : 0;
  const data = eta.data;
  const live = data?.status === 'live' && leg?.boarding;
  const plan = live ? catchPlan(arrivalsForLeg(data.arrivals, leg.boarding!), walkS, now) : null;
  const leaveNow = plan !== null && plan.kind !== 'none' && plan.leaveInS < 60;

  // One buzz when it becomes time to leave (not every refresh).
  const buzzed = useRef(false);
  useEffect(() => {
    if (leaveNow && !buzzed.current) Vibration.vibrate(400);
    buzzed.current = leaveNow;
  }, [leaveNow]);

  // Planned for later? Live lists only reach ~20 min ahead, so say nothing rather than guess.
  const plannedAhead = Date.parse(option.depart_at) > now + LIVE_WINDOW_MS;
  if (!leg?.boarding || plannedAhead) return null;
  const what = leg.route_name ?? 'next';
  const ageS = data ? Math.max(0, Math.round((now - Date.parse(data.fetched_at)) / 1000)) : null;
  const realtime = plan && plan.kind !== 'none' ? plan.departure.realtime : true;
  return (
    <View
      style={[
        styles.box,
        { backgroundColor: leaveNow ? t.warningSurface : t.background, borderColor: t.border },
      ]}
      accessibilityLiveRegion="polite"
    >
      <Icon name="clock-fast" size={18} color={leaveNow ? t.warning : t.primary} />
      <View style={styles.flex1}>
        <Text style={[type.small, styles.strong, { color: t.textPrimary }]}>
          {eta.isPending
            ? 'Checking live departures…'
            : plan
              ? catchMessage(plan, what)
              : 'Live departures unavailable — times below are the plan’s estimate'}
        </Text>
        {plan && ageS !== null ? (
          <Text style={[type.caption, { color: t.textSecondary }]}>
            {walkS > 0 ? `Includes ${formatDuration(walkS)} walk to the stop · ` : ''}
            {realtime ? 'live' : 'scheduled'} · updated {ageS < 10 ? 'just now' : `${ageS} s ago`}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function RerouteBanner({
  alternative,
  saving_s,
  onSwitch,
}: {
  alternative: TripOption;
  saving_s: number;
  onSwitch: () => void;
}) {
  const t = useAppTheme();
  const label = alternative.title.replace(/^(Car|Taxi) via /, '');
  return (
    <View
      style={[styles.box, { backgroundColor: t.warningSurface, borderColor: t.border }]}
      accessibilityLiveRegion="polite"
    >
      <Icon name="car-clock" size={18} color={t.warning} />
      <Text style={[type.small, styles.flex1, { color: t.textPrimary }]}>
        Traffic changed: {label === alternative.title ? 'another route' : `via ${label}`} now saves{' '}
        {formatDuration(saving_s)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Switch to ${alternative.title}`}
        onPress={onSwitch}
        style={[styles.switch, { backgroundColor: t.primary }]}
      >
        <Text style={[type.small, styles.strong, { color: t.onPrimary }]}>Switch</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  flex1: { flex: 1 },
  strong: { fontWeight: '600' },
  switch: {
    minHeight: TAP_TARGET,
    paddingHorizontal: space.md,
    borderRadius: radius.round,
    justifyContent: 'center',
  },
});
