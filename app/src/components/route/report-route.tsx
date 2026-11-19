// "Report a problem" under a selected community route: tap, pick a reason, done.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { REPORT_REASONS, reportRoute, type ReportReason } from '@/lib/route-reports';
import { space, type, useAppTheme } from '@/theme';

export function ReportRoute({ routeId }: { routeId: string }) {
  const t = useAppTheme();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'already' | 'error'>('idle');

  const send = async (reason: ReportReason) => {
    setState('sending');
    try {
      setState(await reportRoute(routeId, reason));
    } catch {
      setState('error');
    }
  };

  if (state === 'sent' || state === 'already') {
    return (
      <Text style={[type.caption, { color: t.textSecondary }]}>
        {state === 'sent'
          ? 'Thanks — the team will check this route.'
          : 'You’ve already reported this route. Thanks!'}
      </Text>
    );
  }

  if (!open) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={styles.link}
        hitSlop={8}
      >
        <Icon name="flag-outline" size={16} color={t.textSecondary} />
        <Text style={[type.small, { color: t.textSecondary }]}>Report a problem</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.box}>
      <Text style={[type.small, { color: t.textPrimary }]}>What’s wrong with this route?</Text>
      <View style={styles.chips}>
        {REPORT_REASONS.map(({ reason, label }) => (
          <Chip
            key={reason}
            small
            label={label}
            onPress={state === 'sending' ? undefined : () => void send(reason)}
          />
        ))}
      </View>
      {state === 'error' ? (
        <Text style={[type.caption, { color: t.danger }]}>
          Couldn’t send the report. Check your connection and try again.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  link: { flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'flex-start' },
  box: { gap: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
