// "Send feedback" (Profile → About, and the welcome screen on the web). D47.
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { PrimaryButton } from '@/components/ui/primary-button';
import {
  FEEDBACK_KINDS,
  FEEDBACK_MAX_LENGTH,
  sendFeedback,
  type FeedbackKind,
} from '@/lib/feedback';
import { radius, space, type, useAppTheme } from '@/theme';

export function FeedbackScreen() {
  const t = useAppTheme();
  const [kind, setKind] = useState<FeedbackKind>('wrong_route');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setState('sending');
    setError(null);
    try {
      await sendFeedback(kind, message);
      setState('sent');
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('idle');
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: t.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[type.body, { color: t.textPrimary }]}>
        Tell the team what’s wrong or what you’d like. Please don’t include personal details — we
        can’t reply here.
      </Text>
      <Text style={[type.caption, { color: t.textSecondary }]}>
        To report one community route, open it on the map and tap “Report a problem”.
      </Text>

      <View
        style={styles.chips}
        accessibilityRole="radiogroup"
        accessibilityLabel="Kind of feedback"
      >
        {FEEDBACK_KINDS.map((k) => (
          <Chip
            key={k.kind}
            label={k.label}
            selected={kind === k.kind}
            onPress={() => setKind(k.kind)}
          />
        ))}
      </View>

      <TextInput
        value={message}
        onChangeText={(text) => {
          setMessage(text);
          if (state === 'sent') setState('idle');
        }}
        placeholder={
          kind === 'wrong_route'
            ? 'Which route, and what’s wrong? e.g. “Exit A1 → AC2: the lift at Festival Walk L1 is closed”'
            : 'Your message'
        }
        placeholderTextColor={t.textSecondary}
        multiline
        maxLength={FEEDBACK_MAX_LENGTH}
        accessibilityLabel="Your message"
        style={[
          styles.input,
          type.body,
          { color: t.textPrimary, backgroundColor: t.surface, borderColor: t.border },
        ]}
      />
      <Text style={[type.caption, styles.counter, { color: t.textSecondary }]}>
        {message.length} / {FEEDBACK_MAX_LENGTH}
      </Text>

      <PrimaryButton
        label="Send"
        icon="send-outline"
        loading={state === 'sending'}
        disabled={message.trim().length === 0 || state === 'sending'}
        onPress={() => void submit()}
      />

      {state === 'sent' ? (
        <Text accessibilityRole="alert" style={[type.small, { color: t.primary }]}>
          Thank you — the team will read it.
        </Text>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={[type.small, { color: t.danger }]}>
          {error}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, maxWidth: 640, width: '100%', alignSelf: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  input: {
    minHeight: 140,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    textAlignVertical: 'top',
  },
  counter: { alignSelf: 'flex-end' },
});
