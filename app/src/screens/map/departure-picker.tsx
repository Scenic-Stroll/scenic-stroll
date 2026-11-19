/**
 * "Leave now / Leave at…": shade and opening hours are worked out for when you'll actually walk.
 * Quick choices (in 15 / 30 / 60 min) plus a clock for any time. A time earlier than now means
 * tomorrow (e.g. picking 08:00 at night).
 */
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ClockPicker } from './clock-picker';
import { Chip } from '@/components/ui/chip';
import { space, type, useAppTheme } from '@/theme';

const QUICK_MINUTES = [15, 30, 60] as const;

/** A moment `minutes` from now (outside the component: reading the clock isn't render work). */
const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000);

/** A picked clock time earlier than now means tomorrow (e.g. picking 08:00 at night). */
function nextOccurrence(picked: Date): Date {
  const when = new Date(picked);
  if (when.getTime() < Date.now() - 60_000) when.setDate(when.getDate() + 1);
  return when;
}

/** "18:30" (phone's local time — the app is used in Hong Kong). */
const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function DeparturePicker({
  value,
  onChange,
}: {
  /** null = leave now. */
  value: Date | null;
  onChange: (when: Date | null) => void;
}) {
  const t = useAppTheme();
  const [clockOpen, setClockOpen] = useState(false);
  const [quick, setQuick] = useState<number | null>(null);

  const pickQuick = (minutes: number) => {
    setQuick(minutes);
    onChange(minutesFromNow(minutes));
  };

  const onClock = (picked: Date) => {
    setQuick(null);
    onChange(nextOccurrence(picked));
  };

  const clockLabel = value && quick === null ? `At ${hhmm(value)}` : 'At…';

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        <Chip
          small
          icon="clock-outline"
          label="Leave now"
          selected={value === null}
          onPress={() => {
            setQuick(null);
            onChange(null);
          }}
        />
        {QUICK_MINUTES.map((m) => (
          <Chip
            key={m}
            small
            label={m === 60 ? 'In 1 h' : `In ${m} min`}
            selected={value !== null && quick === m}
            onPress={() => pickQuick(m)}
          />
        ))}
        <Chip
          small
          icon="calendar-clock"
          label={clockLabel}
          selected={value !== null && quick === null}
          onPress={() => setClockOpen(true)}
        />
      </ScrollView>

      {value ? (
        <Text style={[type.caption, { color: t.textSecondary }]}>
          Leaving at {hhmm(value)} — shade and opening hours are for then
        </Text>
      ) : null}

      {clockOpen ? (
        <ClockPicker
          value={value ?? new Date()}
          onPick={onClock}
          onClose={() => setClockOpen(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  row: { gap: space.sm, paddingVertical: 2 },
});
