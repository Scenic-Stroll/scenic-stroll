// /admin — experts see their pins and "New pin"; reviewers (admins) also see the review queue and
// can add experts. Not a tab: open https://<site>/admin (docs/PINS.md). D53.
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { addExpert, useAdminPins, useMyPinRole, type AdminPinRow } from '@/lib/pins-admin';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { space, type, useAppTheme } from '@/theme';

import { EmailSignIn } from './email-sign-in';
import { Badge, Button, ErrorText, Field, Row, Section, STATUS_TEXT } from './parts';

export function AdminHome() {
  const t = useAppTheme();
  const auth = useAuth();
  const role = useMyPinRole();

  if (auth.status !== 'signed-in') return <ActivityIndicator style={styles.pad} />;
  const user = auth.session.user;
  const signOut = async () => {
    await supabase.auth.signOut();
    auth.retry(); // back to an anonymous account
  };

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.page}>
      {user.is_anonymous ? (
        <EmailSignIn />
      ) : role.isLoading ? (
        <ActivityIndicator />
      ) : role.data === null || role.data === undefined ? (
        <Section title="Waiting to be added">
          <Text style={[type.body, { color: t.textPrimary }]}>
            You’re signed in as {user.email}. A reviewer adds you as an expert after checking who
            you are. Send them this account id:
          </Text>
          <Text selectable style={[type.body, styles.mono, { color: t.textPrimary }]}>
            {user.id}
          </Text>
          <Button label="Sign out" onPress={() => void signOut()} />
        </Section>
      ) : (
        <>
          <Row>
            <Text style={[type.body, { color: t.textSecondary }]}>
              {user.email} · {role.data === 'admin' ? 'Reviewer' : 'Expert'}
            </Text>
            <Button label="New pin" tone="primary" onPress={() => router.push('/admin/new')} />
            <Button label="Sign out" onPress={() => void signOut()} />
          </Row>
          <PinLists admin={role.data === 'admin'} />
          {role.data === 'admin' ? <AddExpert adminId={user.id} /> : null}
        </>
      )}
    </ScrollView>
  );
}

function PinLists({ admin }: { admin: boolean }) {
  const pins = useAdminPins();
  if (pins.isLoading) return <ActivityIndicator />;
  if (pins.error) return <ErrorText text={pins.error.message} />;
  const all = pins.data ?? [];
  const groups: [string, AdminPinRow[]][] = [
    [admin ? 'Waiting for review' : 'In review', all.filter((p) => p.status === 'in_review')],
    ['Drafts', all.filter((p) => p.status === 'draft')],
    ['Live', all.filter((p) => p.status === 'live')],
    ['Paused', all.filter((p) => p.status === 'paused')],
  ];
  return (
    <>
      {groups.map(([title, list]) => (
        <Section key={title} title={`${title} (${list.length})`}>
          {list.length === 0 ? <Text>—</Text> : list.map((p) => <PinRow key={p.id} pin={p} />)}
        </Section>
      ))}
    </>
  );
}

function PinRow({ pin }: { pin: AdminPinRow }) {
  const t = useAppTheme();
  const status = STATUS_TEXT[pin.status]!;
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push({ pathname: '/admin/pin/[id]', params: { id: pin.id } })}
      style={styles.pinRow}
    >
      <Text style={[type.body, styles.flex, { color: t.primary }]}>{pin.title}</Text>
      {pin.is_sample ? <Badge text="Sample" tone="warn" /> : null}
      <Badge text={status.text} tone={status.tone} />
    </Pressable>
  );
}

function AddExpert({ adminId }: { adminId: string }) {
  const [userId, setUserId] = useState('');
  const [name, setName] = useState('');
  const [field, setField] = useState('');
  const [orcid, setOrcid] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    setMessage(null);
    try {
      await addExpert({
        user_id: userId.trim(),
        display_name: name.trim(),
        field: field.trim(),
        verification_method: orcid.trim() ? 'orcid' : 'manual',
        orcid_id: orcid.trim() || null,
        admin_id: adminId,
      });
      setMessage(`${name.trim()} can now write pins.`);
      setUserId('');
      setName('');
      setField('');
      setOrcid('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Section title="Add an expert">
      <Text>
        Check who they are first (ORCID record, university email or in person). They send you the
        account id shown after they sign in here.
      </Text>
      <Field label="Account id" value={userId} onChangeText={setUserId} autoCapitalize="none" />
      <Field label="Name shown on pins" value={name} onChangeText={setName} />
      <Field label="Field" value={field} onChangeText={setField} placeholder="e.g. Urban history" />
      <Field
        label="ORCID iD (optional)"
        value={orcid}
        onChangeText={setOrcid}
        placeholder="0000-0002-1825-0097"
        autoCapitalize="characters"
      />
      <Button
        label="Add expert"
        tone="primary"
        disabled={
          !/^[0-9a-f-]{36}$/i.test(userId.trim()) ||
          name.trim().length < 2 ||
          field.trim().length < 2
        }
        onPress={() => void save()}
      />
      {message ? <Text>{message}</Text> : null}
      <ErrorText text={error} />
    </Section>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg, maxWidth: 960, width: '100%', alignSelf: 'center' },
  pad: { padding: space.xl },
  mono: { fontFamily: 'monospace' },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs },
  flex: { flex: 1 },
});
