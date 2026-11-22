// Experts and reviewers sign in with their email (D53). Everyone else stays anonymous.
//
// Supabase emails a sign-in link (its default email — editing the text needs a custom email
// sender). The link opens this site's /admin page and signs you in; open it in the same browser.
// If the team later adds the 6-digit code to the email ({{ .Token }}), it can be typed here instead.
// Supabase → Authentication → URL Configuration must allow this site's address (docs/PINS.md).
import { useState } from 'react';
import { Platform, Text } from 'react-native';

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
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      // Come back to this site's admin page (not Supabase's default "Site URL").
      options:
        Platform.OS === 'web' ? { emailRedirectTo: `${window.location.origin}/admin` } : undefined,
    });
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
    if (err) setError('That code didn’t work. Check it, or ask for a new email.');
  };

  return (
    <Section title="Sign in for experts and reviewers">
      <Text style={[type.body, { color: t.textSecondary }]}>
        Pins are written by experts and checked by reviewers. Sign in with your email — we’ll send
        you a sign-in link.
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
          label="Email me a sign-in link"
          tone="primary"
          disabled={busy || !/^\S+@\S+\.\S+$/.test(email.trim())}
          onPress={() => void send()}
        />
      ) : (
        <>
          <Text accessibilityRole="alert" style={[type.body, { color: t.textPrimary }]}>
            Check your email and open the link in this browser. It works once and expires after an
            hour.
          </Text>
          <Field
            label="Or type the code, if your email has one"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
          />
          <Button
            label="Sign in with the code"
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
