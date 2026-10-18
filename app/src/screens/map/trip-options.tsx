/**
 * Comparison cards for the All, Transit, Car and Taxi tabs (multimodal steps 1–4), with sort chips
 * (Best for you · Fastest · Cheapest · Greenest · Least walking). Each card: big time, arrival,
 * cost, CO₂, walking minutes, a leg strip (🚶 13 / 🚗 6), labels (Fastest, Greenest…), the green
 * nudge when walking is nearly as quick, and for cars the traffic delay — or a clear "typical
 * traffic" note when there's no live data. Every number comes from plan-trip; nothing is guessed.
 */
import {
  formatDistance,
  formatDuration,
  fasterAlternative,
  formatHkTime,
  RUSH_HOUR_FACTOR,
  sortTrips,
  TRIP_SORTS,
  type TripSort,
  type TripLabel,
  type TripOption,
} from '@scenic/shared';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { Icon, type IconName } from '@/components/ui/icon';
import { radius, space, type, useAppTheme } from '@/theme';

import type { TripPlan } from '@/lib/demo-trips';
import { useRushHour } from '@/lib/rush-hour-store';

import { LiveTransit, RerouteBanner } from './live-trip';

const SORT_LABELS: Record<TripSort, string> = {
  best: 'Best for you',
  fastest: 'Fastest',
  cheapest: 'Cheapest',
  greenest: 'Greenest',
  least_walking: 'Least walking',
};

const LABELS: Record<TripLabel, { text: string; icon: IconName }> = {
  fastest: { text: 'Fastest', icon: 'flash' },
  cheapest: { text: 'Cheapest', icon: 'cash' },
  greenest: { text: 'Greenest', icon: 'leaf' },
  least_walking: { text: 'Least walking', icon: 'seat-recline-normal' },
  most_sheltered: { text: 'Most sheltered', icon: 'umbrella-outline' },
  step_free: { text: 'Step-free', icon: 'wheelchair-accessibility' },
  avoids_traffic: { text: 'Avoids traffic', icon: 'car-clock' },
};

const LEG_ICONS: Record<TripOption['legs'][number]['mode'], IconName> = {
  walk: 'walk',
  car: 'car',
  transit: 'train',
  taxi: 'taxi',
};

function costText(o: TripOption): string {
  if (o.cost_range_hkd) {
    const [low, high] = o.cost_range_hkd.map(Math.round);
    return low === high ? `~HK$${low} (meter)` : `HK$${low}–${high} (meter)`;
  }
  if (o.cost_hkd === null) return o.mode === 'transit' ? 'Fare unavailable' : 'Cost unavailable';
  if (o.cost_hkd === 0) return 'Free';
  return `HK$${o.cost_hkd.toFixed(1)}${o.mode === 'transit' ? ' (Octopus)' : ''}`;
}

/** Plain words for what's estimated on a card, so nothing looks more certain than it is. */
function estimateNotes(o: TripOption): string[] {
  const notes: string[] = [];
  const liveWait = o.legs.some((l) => l.live_departures && l.live_departures.length > 0);
  if (o.estimated.includes('transit_times')) {
    if (liveWait) {
      notes.push(
        o.source === 'mtr-open-data'
          ? 'Next departure is live · ride time estimated from distance'
          : 'Next departure is live · ride time from the timetable',
      );
    } else {
      notes.push(
        o.source === 'mtr-open-data'
          ? 'Train times estimated from distance (MTR open data) — not live'
          : 'Scheduled times — not live',
      );
    }
  }
  if (o.estimated.includes('walk_legs')) notes.push('Walks to and from stations are estimates');
  if (o.estimated.includes('taxi_fare')) {
    notes.push('Fare from the official taxi meter — tunnel tolls and luggage extra');
  }
  if (o.estimated.includes('simulated_traffic')) {
    notes.push('Traffic simulated for the demo (not live)');
  }
  if (o.estimated.includes('taxi_pickup')) notes.push('Includes ~3 min to get a taxi (estimate)');
  return notes;
}

function TripCard({
  option: o,
  selected,
  onPress,
}: {
  option: TripOption;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useAppTheme();
  const walkMin = Math.round(o.walking_s / 60);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${o.title}, ${formatDuration(o.total_s)}, arrive ${formatHkTime(o.arrive_at)}`}
      onPress={onPress}
      style={[
        styles.card,
        { backgroundColor: t.surface, borderColor: selected ? t.primary : 'transparent' },
      ]}
    >
      {o.recommended && o.nudge ? (
        <View style={[styles.nudge, { backgroundColor: t.successSurface }]}>
          <Icon name="leaf" size={16} color={t.primary} />
          <Text style={[type.small, styles.flex1, { color: t.textPrimary }]}>{o.nudge}</Text>
        </View>
      ) : null}

      <View style={styles.header}>
        <Text style={[type.heading, { color: t.textPrimary }]}>{formatDuration(o.total_s)}</Text>
        <View style={styles.flex1}>
          <Text style={[type.body, styles.bold, { color: t.textPrimary }]} numberOfLines={1}>
            {o.title}
          </Text>
          <Text style={[type.caption, { color: t.textSecondary }]}>
            Arrive {formatHkTime(o.arrive_at)} · {formatDistance(o.distance_m)} · {costText(o)}
          </Text>
        </View>
      </View>

      {/* Leg strip: 🚶 13 → 🚗 6 */}
      <View style={styles.legs}>
        {o.legs.map((leg, i) => {
          const min = Math.max(
            1,
            Math.round(
              (new Date(leg.arrive_at).getTime() - new Date(leg.depart_at).getTime()) / 60_000,
            ),
          );
          return (
            <View key={i} style={styles.leg}>
              {i > 0 ? <Icon name="chevron-right" size={14} color={t.textSecondary} /> : null}
              <Icon
                name={LEG_ICONS[leg.mode]}
                size={18}
                color={leg.mode === 'transit' && leg.color ? leg.color : t.textPrimary}
              />
              {leg.mode === 'transit' && leg.route_name ? (
                <Text
                  style={[
                    type.caption,
                    styles.lineName,
                    { backgroundColor: leg.color ?? t.textSecondary, color: '#FFFFFF' },
                  ]}
                  numberOfLines={1}
                >
                  {leg.route_name}
                </Text>
              ) : null}
              <Text style={[type.small, { color: t.textPrimary }]}>{min}</Text>
              {leg.realtime ? <View style={[styles.live, { backgroundColor: t.primary }]} /> : null}
            </View>
          );
        })}
      </View>

      <View style={styles.chips}>
        <Chip small icon="molecule-co2" label={o.co2_g === 0 ? '0 g CO₂' : `~${o.co2_g} g CO₂`} />
        {walkMin > 0 ? <Chip small icon="walk" label={`${walkMin} min walking`} /> : null}
        {o.traffic?.delay_s ? (
          <Chip small icon="car-clock" label={`+${formatDuration(o.traffic.delay_s)} traffic`} />
        ) : null}
        {o.labels.map((l) => (
          <Chip key={l} small icon={LABELS[l].icon} label={LABELS[l].text} />
        ))}
      </View>

      {o.traffic?.avoids ? (
        <Text style={[type.caption, { color: t.textPrimary }]}>{o.traffic.avoids}</Text>
      ) : null}
      {o.traffic && !o.traffic.live ? (
        <Text style={[type.caption, { color: t.textSecondary }]}>
          Typical traffic — live traffic isn’t available right now
        </Text>
      ) : null}
      {selected && o.mode === 'transit' ? <LiveTransit option={o} /> : <LiveDeparture option={o} />}
      {estimateNotes(o).map((n) => (
        <Text key={n} style={[type.caption, { color: t.textSecondary }]}>
          {n}
        </Text>
      ))}
      {o.mode === 'transit' && o.waiting_s > 0 ? (
        <Text style={[type.caption, { color: t.textSecondary }]}>
          Includes ~{formatDuration(o.waiting_s)} waiting
          {o.transfers > 0 ? ` · ${o.transfers} change${o.transfers > 1 ? 's' : ''}` : ''}
        </Text>
      ) : null}
      {o.step_free !== 'yes' && o.mode !== 'car' && o.mode !== 'taxi' ? (
        <Text style={[type.caption, { color: t.textSecondary }]}>
          {o.step_free === 'no' ? 'Has stairs' : 'Step-free not confirmed'}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * "Kwun Tong Line from Kowloon Tong 08:23 · then 08:27 (live)" — the train or bus this trip
 * counts on, and the next ones in case you miss it.
 */
function LiveDeparture({ option: o }: { option: TripOption }) {
  const t = useAppTheme();
  const leg = o.legs.find((l) => l.live_departures && l.live_departures.length > 0);
  if (!leg) return null;
  const [first, ...later] = leg.live_departures!;
  return (
    <View style={styles.liveLine}>
      <View style={[styles.live, { backgroundColor: t.primary }]} />
      <Text style={[type.caption, styles.flex1, { color: t.textPrimary }]}>
        {leg.route_name ?? 'Next'}
        {leg.from_name ? ` from ${leg.from_name}` : ''} at {formatHkTime(first!)}
        {later.length > 0 ? ` · then ${later.map(formatHkTime).join(', ')}` : ''}
        {leg.realtime ? ' (live)' : ' (scheduled)'}
      </Text>
    </View>
  );
}

export function TripOptions({
  plan,
  updatedAt,
  loading,
  modeFilter,
  selectedId,
  onSelect,
}: {
  plan: TripPlan | null | undefined;
  /** When `plan` was fetched (ms): a "faster route" is only offered after a later refresh. */
  updatedAt: number;
  loading: boolean;
  /** 'all' = every option (best for you first); otherwise one mode. */
  modeFilter: 'all' | TripOption['mode'];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useAppTheme();
  const [sort, setSort] = useState<TripSort>('best');
  const rushHour = useRushHour((s) => s.on);
  const filtered = (plan?.options ?? []).filter(
    (o) => modeFilter === 'all' || o.mode === modeFilter,
  );
  // The server already sends "best for you" first; other orders are re-sorted here.
  const options = plan ? sortTrips(filtered, sort, plan.condition) : filtered;
  // When the shown option was picked. A faster car route is suggested only once the plan has
  // been refreshed since (traffic changed), not straight after you chose a slower one on purpose.
  const [pickedAt, setPickedAt] = useState(updatedAt);
  const pick = (id: string) => {
    setPickedAt(updatedAt);
    onSelect(id);
  };
  const shown = options.find((o) => o.id === selectedId) ?? options[0];
  const faster =
    plan && shown && updatedAt > pickedAt ? fasterAlternative(shown, plan.options) : null;
  if (loading && options.length === 0) {
    return <Text style={[type.small, { color: t.textSecondary }]}>Comparing ways to travel…</Text>;
  }
  if (!plan) {
    return (
      <Text style={[type.small, { color: t.textSecondary }]}>
        Other ways to travel aren’t available right now — walking routes still work.
      </Text>
    );
  }
  const missing = plan.unavailable.filter((u) => modeFilter === 'all' || u.mode === modeFilter);
  return (
    <View style={styles.list}>
      {plan.savedFor ? (
        <Text style={[type.small, styles.simulated, { color: t.warning }]}>
          Saved for the demo ({plan.savedFor}) — the live service didn’t answer. Times are as
          measured then, moved to start now.
        </Text>
      ) : null}
      {rushHour ? (
        <Text style={[type.small, styles.simulated, { color: t.warning }]}>
          Rush hour simulated (demo): driving takes ×{RUSH_HOUR_FACTOR} as long. Turn off in Profile
          → Diagnostics.
        </Text>
      ) : null}
      {faster && shown ? (
        <RerouteBanner
          alternative={faster}
          saving_s={shown.total_s - faster.total_s}
          onSwitch={() => pick(faster.id)}
        />
      ) : null}
      {options.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sorts}
          accessibilityLabel="Sort options"
        >
          {TRIP_SORTS.map((s) => (
            <Chip
              key={s}
              small
              label={SORT_LABELS[s]}
              selected={sort === s}
              onPress={() => setSort(s)}
            />
          ))}
        </ScrollView>
      ) : null}
      {options.map((o) => (
        <TripCard key={o.id} option={o} selected={o.id === selectedId} onPress={() => pick(o.id)} />
      ))}
      {missing.map((u) => (
        <Text key={u.mode} style={[type.small, { color: t.textSecondary }]}>
          {u.reason}
        </Text>
      ))}
      <Text style={[type.caption, { color: t.textSecondary }]}>
        CO₂ is an estimate (car and taxi: average car, per vehicle; MTR and buses per passenger).
        Car times
        {plan.data_freshness.traffic_at ? ' use live traffic' : ' are typical, not live'}.
        {plan.data_freshness.eta_at
          ? ` Live departures checked at ${formatHkTime(plan.data_freshness.eta_at)}.`
          : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.md },
  sorts: { gap: space.xs },
  simulated: { fontWeight: '600' },
  liveLine: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  card: { borderRadius: radius.md, borderWidth: 2, padding: space.md, gap: space.sm },
  nudge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex1: { flex: 1 },
  bold: { fontWeight: '600' },
  legs: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' },
  leg: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  live: { width: 6, height: 6, borderRadius: 3, marginLeft: 2 },
  lineName: { paddingHorizontal: 4, borderRadius: 4, overflow: 'hidden', fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
