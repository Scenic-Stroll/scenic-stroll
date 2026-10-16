/**
 * The end of a walk: "You've arrived", the one-question feedback (computed routes only) and
 * "Save as a community route" (smart routing step 7).
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { PrimaryButton } from '@/components/ui/primary-button';
import { useFollow, type FollowSession } from '@/lib/follow-store';
import { canAskFeedback } from '@/lib/walk-feedback';
import { radius, space, type, useAppTheme } from '@/theme';

import { SaveRouteForm } from './save-route-form';
import { WalkFeedbackQuestion } from './walk-feedback-question';

export function ArrivedPanel({ session }: { session: FollowSession }) {
  const t = useAppTheme();
  const stop = useFollow((st) => st.stop);
  const [saving, setSaving] = useState<'closed' | 'open' | 'saved'>('closed');

  return (
    <View style={styles.container}>
      <View style={[styles.arrived, { backgroundColor: t.successSurface }]}>
        <Icon name="flag-checkered" size={28} color={t.primary} />
        <Text style={[type.title, styles.flex1, { color: t.textPrimary }]}>
          You’ve arrived at {session.destinationLabel}
        </Text>
      </View>

      {canAskFeedback(session) ? <WalkFeedbackQuestion session={session} /> : null}

      {saving === 'closed' ? (
        <PrimaryButton
          label="Save as a community route"
          icon="map-plus"
          variant="secondary"
          accessibilityHint="Shares this walk so others can find it and confirm it"
          onPress={() => setSaving('open')}
        />
      ) : null}
      {saving === 'open' ? (
        <SaveRouteForm session={session} onSaved={() => setSaving('saved')} />
      ) : null}
      {saving === 'saved' ? (
        <Text accessibilityLiveRegion="polite" style={[type.small, { color: t.textPrimary }]}>
          Saved — it’s on the map as “Unverified” until other walkers confirm it.
        </Text>
      ) : null}

      <PrimaryButton label="Done" icon="check" onPress={stop} />
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
});
