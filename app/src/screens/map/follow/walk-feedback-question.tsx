/**
 * "Was this route sheltered as promised? 👍 / Partly / 👎" — one tap after a computed walk.
 * The answer becomes a vote on the walk's paths (see shared/src/edge-feedback.ts for what votes do).
 * You can change your answer; the latest one counts.
 */
import { aspectForProfile, FEEDBACK_QUESTIONS, type FeedbackVerdict } from '@scenic/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useFollowDemo, type FollowSession } from '@/lib/follow-store';
import { submitWalkFeedback } from '@/lib/walk-feedback';
import { radius, space, TAP_TARGET, type, useAppTheme } from '@/theme';

const ANSWERS: { verdict: FeedbackVerdict; label: string }[] = [
  { verdict: 'yes', label: '👍 Yes' },
  { verdict: 'partly', label: 'Partly' },
  { verdict: 'no', label: '👎 No' },
];

export function WalkFeedbackQuestion({ session }: { session: FollowSession }) {
  const t = useAppTheme();
  const simulated = useFollowDemo((d) => d.simulateWalk);
  const [answer, setAnswer] = useState<FeedbackVerdict | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  if (!session.route.profile) return null;
  const question = FEEDBACK_QUESTIONS[aspectForProfile(session.route.profile)];

  const send = (verdict: FeedbackVerdict) => {
    setAnswer(verdict);
    setSending(true);
    setStatus(null);
    submitWalkFeedback(session, verdict, simulated)
      .then((n) =>
        setStatus(
          simulated
            ? 'Thanks! This was a demo walk, so it isn’t counted.'
            : n > 0
              ? `Thanks — that helps the next walker (${n} path${n === 1 ? '' : 's'} rated).`
              : 'Thanks — saved.',
        ),
      )
      .catch((err: Error) => {
        setAnswer(null);
        setStatus(err.message);
      })
      .finally(() => setSending(false));
  };

  return (
    <View style={[styles.box, { backgroundColor: t.surface }]}>
      <Text style={[type.body, styles.bold, { color: t.textPrimary }]}>{question}</Text>
      <View style={styles.row} accessibilityRole="radiogroup">
        {ANSWERS.map((a) => {
          const selected = answer === a.verdict;
          return (
            <Pressable
              key={a.verdict}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: sending }}
              disabled={sending}
              onPress={() => send(a.verdict)}
              style={[
                styles.answer,
                { backgroundColor: selected ? t.primary : t.background, borderColor: t.border },
              ]}
            >
              <Text
                style={[type.small, styles.bold, { color: selected ? t.onPrimary : t.textPrimary }]}
              >
                {a.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {status ? (
        <Text accessibilityLiveRegion="polite" style={[type.caption, { color: t.textSecondary }]}>
          {status}
        </Text>
      ) : (
        <Text style={[type.caption, { color: t.textSecondary }]}>
          Anonymous. Many walkers’ answers together correct the map.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.md, padding: space.md, gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm },
  answer: {
    flex: 1,
    minHeight: TAP_TARGET,
    borderRadius: radius.round,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bold: { fontWeight: '600' },
});
