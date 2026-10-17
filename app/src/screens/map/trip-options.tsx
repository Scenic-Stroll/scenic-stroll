/**
 * Comparison cards for the "All" and "Car" tabs (multimodal step 1). Each card: big time, arrival,
 * cost, CO₂, walking minutes, a leg strip (🚶 13 / 🚗 6), labels (Fastest, Greenest…), the green
 * nudge when walking is nearly as quick, and for cars the traffic delay — or a clear "typical
 * traffic" note when there's no live data. Every number comes from plan-trip; nothing is guessed.
 */
import {
  formatDistance,
  formatDuration,
  formatHkTime,
  type PlanTripResponse,
  type TripLabel,
  type TripOption,
} from '@scenic/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { Icon, type IconName } from '@/components/ui/icon';
import { radius, space, type, useAppTheme } from '@/theme';

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
  if (o.cost_hkd === null) return 'Cost unavailable';
  return o.cost_hkd === 0 ? 'Free' : `HK$${o.cost_hkd.toFixed(1)}`;
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
              <Icon name={LEG_ICONS[leg.mode]} size={18} color={t.textPrimary} />
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
      {o.step_free !== 'yes' && o.mode === 'walk' ? (
        <Text style={[type.caption, { color: t.textSecondary }]}>
          {o.step_free === 'no' ? 'Has stairs' : 'Step-free not confirmed'}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function TripOptions({
  plan,
  loading,
  modeFilter,
  selectedId,
  onSelect,
}: {
  plan: PlanTripResponse | null | undefined;
  loading: boolean;
  /** 'all' = every option (best for you first); otherwise one mode. */
  modeFilter: 'all' | TripOption['mode'];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useAppTheme();
  const options = (plan?.options ?? []).filter(
    (o) => modeFilter === 'all' || o.mode === modeFilter,
  );
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
      {options.map((o) => (
        <TripCard
          key={o.id}
          option={o}
          selected={o.id === selectedId}
          onPress={() => onSelect(o.id)}
        />
      ))}
      {missing.map((u) => (
        <Text key={u.mode} style={[type.small, { color: t.textSecondary }]}>
          {u.reason}
        </Text>
      ))}
      <Text style={[type.caption, { color: t.textSecondary }]}>
        CO₂ is an estimate (average petrol car, one person). Car times
        {plan.data_freshness.traffic_at ? ' use live traffic' : ' are typical, not live'}.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.md },
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
