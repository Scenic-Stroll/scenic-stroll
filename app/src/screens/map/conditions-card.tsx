/**
 * The "Now" card at the top of route planning: live weather from the Hong Kong Observatory and what
 * routes we put first because of it ("31 °C · UV 8 — Very hot, showing shaded routes first").
 * Tap it to choose the priority yourself (e.g. "I'm carrying a laptop, treat it as rain").
 */
import {
  agoLabel,
  CONDITION_MODE_INFO,
  CONDITION_MODES,
  conditionFacts,
  type ConditionMode,
  type Conditions,
} from '@scenic/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { Icon, type IconName } from '@/components/ui/icon';
import { radius, space, type, useAppTheme, type Palette } from '@/theme';

const MODE_ICON: Record<ConditionMode, IconName> = {
  normal: 'weather-partly-cloudy',
  rain: 'weather-pouring',
  heat: 'white-balance-sunny',
  night: 'weather-night',
  typhoon_or_black_rain: 'weather-hurricane',
};

/** Card background + icon colour per mode, from the theme's status colours. */
function modeColors(mode: ConditionMode, t: Palette) {
  switch (mode) {
    case 'rain':
      return { bg: t.infoSurface, icon: t.trace };
    case 'heat':
      return { bg: t.warningSurface, icon: t.warning };
    case 'typhoon_or_black_rain':
      return { bg: t.dangerSurface, icon: t.danger };
    default:
      return { bg: t.surface, icon: t.textSecondary };
  }
}

/** Where the numbers come from — always shown, so nobody mistakes old or fake data for live. */
function sourceLine(c: Conditions, simulated: boolean): string {
  if (simulated) return 'Simulated weather (demo mode)';
  if (c.source === 'defaults') return 'Live weather unavailable — based on time of day';
  const when = agoLabel(c.observed_at ?? c.fetched_at);
  return c.source === 'cache'
    ? `Hong Kong Observatory · offline, last report ${when}`
    : `Hong Kong Observatory · updated ${when}`;
}

export function ConditionsCard({
  conditions,
  mode,
  isOverridden,
  isSimulated,
  onOverride,
}: {
  conditions: Conditions;
  /** The mode routes are prioritised for (the user's choice or the weather's). */
  mode: ConditionMode;
  isOverridden: boolean;
  isSimulated: boolean;
  /** null = go back to following the weather. */
  onOverride: (mode: ConditionMode | null) => void;
}) {
  const t = useAppTheme();
  const [open, setOpen] = useState(false);
  const colors = modeColors(mode, t);
  const info = CONDITION_MODE_INFO[mode];
  const facts = conditionFacts(conditions);
  const warnings = conditions.warnings.map((w) => w.name).join(', ');

  const choose = (next: ConditionMode | null) => {
    onOverride(next);
    setOpen(false);
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.bg }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Now: ${facts || 'no live weather'}. ${info.headlineEn}. ${
          isOverridden ? 'Your choice. ' : ''
        }Tap to change what routes are prioritised for.`}
        onPress={() => setOpen((o) => !o)}
        style={styles.row}
      >
        <Icon name={MODE_ICON[mode]} size={28} color={colors.icon} />
        <View style={styles.flex1}>
          {facts ? (
            <Text style={[type.body, styles.bold, { color: t.textPrimary }]}>{facts}</Text>
          ) : null}
          <Text style={[type.small, { color: t.textPrimary }]}>
            {info.headlineEn}
            {isOverridden ? ' (your choice)' : ''}
          </Text>
          <Text style={[type.caption, { color: t.textSecondary }]}>{info.headlineZh}</Text>
          {warnings ? (
            <Text style={[type.caption, styles.bold, { color: t.textPrimary }]}>
              In force: {warnings}
            </Text>
          ) : null}
          <Text style={[type.caption, { color: t.textSecondary }]}>
            {sourceLine(conditions, isSimulated)}
          </Text>
        </View>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={22} color={t.textSecondary} />
      </Pressable>

      {mode === 'typhoon_or_black_rain' ? (
        <Text style={[type.small, styles.bold, { color: t.danger }]}>
          Stay indoors if you can. If you must walk, keep it short and indoors.
        </Text>
      ) : null}

      {open ? (
        <View style={styles.chips}>
          <Text style={[type.caption, styles.chipsLabel, { color: t.textSecondary }]}>
            Prioritise routes for · 路線優先考慮
          </Text>
          <Chip
            small
            label="Auto (weather)"
            selected={!isOverridden}
            onPress={() => choose(null)}
          />
          {CONDITION_MODES.map((m) => (
            <Chip
              key={m}
              small
              icon={MODE_ICON[m]}
              label={`${CONDITION_MODE_INFO[m].en} · ${CONDITION_MODE_INFO[m].zh}`}
              selected={isOverridden && mode === m}
              onPress={() => choose(m)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.md, padding: space.md, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex1: { flex: 1 },
  bold: { fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chipsLabel: { width: '100%' },
});
