// Experts and reviewers sign in with an email code (D53). Everyone else stays anonymous.
// Supabase emails a 6-digit code (the "Magic link" email template must contain {{ .Token }} —
// docs/PINS.md); typing it here signs in on any device.
import { useState } from 'react';
import { Text } from 'react-native';

import { supabase } from '@/lib/supabase';
import { type, useAppTheme } from '@/theme';

import { Button, ErrorText, Field, Section } from './parts';

export function EmailSignIn() {
  const t = useAppTheme();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({ email: email.trim() });
    setBusy(false);
    if (err) setError(err.message);
    else setSent(true);
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });
    setBusy(false);
    if (err) setError('That code didn’t work. Check it, or ask for a new one.');
  };

  return (
    <Section title="Sign in for experts and reviewers">
      <Text style={[type.body, { color: t.textSecondary }]}>
        Pins are written by experts and checked by reviewers. Sign in with your email; we’ll send
        you a 6-digit code.
      </Text>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        editable={!sent}
      />
      {!sent ? (
        <Button
          label="Send code"
          tone="primary"
          disabled={busy || !/^\S+@\S+\.\S+$/.test(email.trim())}
          onPress={() => void send()}
        />
      ) : (
        <>
          <Field
            label="Code from the email"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
          />
          <Button
            label="Sign in"
            tone="primary"
            disabled={busy || code.trim().length < 6}
            onPress={() => void verify()}
          />
          <Button label="Use another email" onPress={() => setSent(false)} />
        </>
      )}
      <ErrorText text={error} />
    </Section>
  );
}
