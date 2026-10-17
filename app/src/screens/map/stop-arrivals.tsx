/**
 * Stop card body (multimodal step 3): the routes calling at a bus/minibus stop or MTR station and
 * their next arrivals, live from the operator (refreshed every 30 s). Shown inside the place
 * sheet when a stop on the "Transit stops" layer is tapped. Times are never invented: when the
 * operator doesn't answer we say so and only list the routes.
 */
import { findStop, type StopArrival, type TransitOperator } from '@scenic/shared';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { Icon, type IconName } from '@/components/ui/icon';
import { useStopEta } from '@/lib/stop-eta';
import { space, type, useAppTheme } from '@/theme';

export const OPERATOR_LABEL: Record<TransitOperator, { en: string; zh: string; icon: IconName }> = {
  mtr: { en: 'MTR station', zh: '港鐵站', icon: 'subway-variant' },
  kmb: { en: 'KMB bus stop', zh: '九巴巴士站', icon: 'bus' },
  ctb: { en: 'Citybus stop', zh: '城巴巴士站', icon: 'bus' },
  gmb: { en: 'Green minibus stop', zh: '綠色專線小巴站', icon: 'van-passenger' },
};

/** How many upcoming times to show per route and direction. */
const TIMES_PER_ROUTE = 3;

/** "Arriving", "4 min" — minutes from now, rounded down so we never promise more time than there is. */
function minutesFrom(at: string, now: number): string {
  const min = Math.floor((Date.parse(at) - now) / 60_000);
  return min <= 0 ? 'Arriving' : `${min} min`;
}

/** Group arrivals by route + destination, keeping the order of the soonest. */
function groupArrivals(arrivals: StopArrival[]) {
  const groups = new Map<string, StopArrival[]>();
  for (const a of arrivals) {
    const key = `${a.route}|${a.dest_en}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }
  return [...groups.values()];
}

export function StopArrivals({ stopId }: { stopId: string }) {
  const t = useAppTheme();
  const stop = findStop(stopId);
  const eta = useStopEta(stopId);
  // Re-render every 15 s so "4 min" counts down between refreshes.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  if (!stop) return null;
  const data = eta.data;
  const groups = data
    ? groupArrivals(data.arrivals.filter((a) => Date.parse(a.at) >= now - 30_000))
    : [];
  const ageS = data ? Math.max(0, Math.round((now - Date.parse(data.fetched_at)) / 1000)) : null;

  return (
    <View style={styles.container}>
      <Text style={[type.small, styles.label, { color: t.textSecondary }]}>
        {stop.operator === 'mtr' ? 'Lines' : 'Routes'}
      </Text>
      <View style={styles.chips}>
        {stop.routes.map((r) => (
          <Chip key={r} label={r} small />
        ))}
      </View>

      <Text style={[type.small, styles.label, styles.heading, { color: t.textSecondary }]}>
        Next arrivals · 下一班
      </Text>
      {eta.isPending ? (
        <Text style={[type.small, { color: t.textSecondary }]}>Checking live times…</Text>
      ) : !data || data.status === 'unavailable' ? (
        <Text style={[type.small, { color: t.textSecondary }]}>
          Live times unavailable right now. The routes above stop here.
        </Text>
      ) : groups.length === 0 ? (
        <Text style={[type.small, { color: t.textSecondary }]}>
          Nothing due in the next while (the service may have stopped for the night).
        </Text>
      ) : (
        groups.map((list) => {
          const first = list[0]!;
          return (
            <View key={`${first.route}|${first.dest_en}`} style={styles.row}>
              <Text style={[type.body, styles.strong, styles.route, { color: t.textPrimary }]}>
                {first.route}
              </Text>
              <View style={styles.flex1}>
                <Text style={[type.body, { color: t.textPrimary }]} numberOfLines={1}>
                  {first.dest_en ? `To ${first.dest_en}` : 'Next'}
                  {first.platform ? ` · Platform ${first.platform}` : ''}
                </Text>
                {first.dest_zh ? (
                  <Text style={[type.small, { color: t.textSecondary }]} numberOfLines={1}>
                    往 {first.dest_zh}
                  </Text>
                ) : null}
              </View>
              <View style={styles.times}>
                <Text style={[type.body, styles.strong, { color: t.textPrimary }]}>
                  {list
                    .slice(0, TIMES_PER_ROUTE)
                    .map((a) => minutesFrom(a.at, now))
                    .join(' · ')}
                </Text>
                <View style={styles.liveRow}>
                  {first.realtime ? (
                    <View style={[styles.liveDot, { backgroundColor: t.primary }]} />
                  ) : null}
                  <Text style={[type.caption, { color: t.textSecondary }]}>
                    {first.realtime ? 'Live' : 'Scheduled'}
                  </Text>
                </View>
              </View>
            </View>
          );
        })
      )}
      {ageS !== null && data?.status === 'live' ? (
        <Text style={[type.caption, { color: t.textSecondary }]}>
          Updated {ageS < 10 ? 'just now' : `${ageS} s ago`} · from{' '}
          {stop.operator === 'mtr' ? 'MTR Next Train' : stop.operator.toUpperCase()} via DATA.GOV.HK
        </Text>
      ) : null}

      <View style={styles.row}>
        <Icon name="wheelchair-accessibility" size={20} color={t.textSecondary} />
        <Text style={[type.small, styles.flex1, { color: t.textSecondary }]}>
          {stop.operator === 'mtr'
            ? 'Step-free access: unconfirmed here — check which exit has a lift.'
            : 'Step-free access: unconfirmed (kerbs and shelters aren’t in the operator’s data).'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.sm },
  label: { fontWeight: '600' },
  strong: { fontWeight: '700' },
  heading: { marginTop: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  route: { minWidth: 44 },
  flex1: { flex: 1 },
  times: { alignItems: 'flex-end' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
});
