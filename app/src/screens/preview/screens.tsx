// The preview mock-ups (pins phase 7, D57) — clickable, made-up data, no backend:
//   boards, board    — topic boards (UC2)
//   teacher, student — a course walk for a class, and a student's question (UC3)
//   shop, staff      — a shop offer with a one-time QR code, and the staff check (UC6; adults only)
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { PrimaryButton } from '@/components/ui/primary-button';
import { useFeatureRules } from '@/lib/user-settings';
import { radius, space, type, useAppTheme } from '@/theme';

import { FAKE_BOARDS, FAKE_OFFER, FAKE_QUESTION, FAKE_STUDENTS } from './data';
import { Card, PreviewPage, ProgressBar } from './parts';

const go = (screen: string, board?: string) =>
  router.push({ pathname: '/preview/[screen]', params: { screen, ...(board ? { board } : {}) } });

export function PreviewMenu() {
  const rules = useFeatureRules();
  const t = useAppTheme();
  const items: [string, string, string][] = [
    ['boards', 'Topic boards', 'Collect a set of pins on one topic'],
    ['teacher', 'Teacher: build a course walk', 'Pick pins for a class, see progress'],
    ['student', 'Student: a question on the walk', 'Answer at a pin during a class walk'],
  ];
  // Shop offers are never shown to under-18s (safety mode).
  if (rules.shopOffers) {
    items.push(['shop', 'Shop offer and one-time code', 'An offer unlocked by your level']);
    items.push(['staff', 'Shop staff: check a code', 'What the shop sees']);
  }
  return (
    <PreviewPage>
      {items.map(([screen, title, body]) => (
        <Pressable key={screen} accessibilityRole="link" onPress={() => go(screen)}>
          <Card>
            <Text style={[type.title, { color: t.primary }]}>{title}</Text>
            <Text style={[type.small, { color: t.textSecondary }]}>{body}</Text>
          </Card>
        </Pressable>
      ))}
    </PreviewPage>
  );
}

export function BoardsPreview() {
  const t = useAppTheme();
  return (
    <PreviewPage>
      {FAKE_BOARDS.map((b) => (
        <Pressable key={b.id} accessibilityRole="link" onPress={() => go('board', b.id)}>
          <Card>
            <Text style={[type.title, { color: t.textPrimary }]}>{b.title}</Text>
            <Text style={[type.small, { color: t.textSecondary }]}>{b.blurb}</Text>
            <ProgressBar value={b.collected / b.pins.length} />
            <Text style={[type.caption, { color: t.textSecondary }]}>
              {b.collected} of {b.pins.length} pins collected
            </Text>
          </Card>
        </Pressable>
      ))}
    </PreviewPage>
  );
}

export function BoardPreview({ boardId }: { boardId: string | undefined }) {
  const t = useAppTheme();
  const board = FAKE_BOARDS.find((b) => b.id === boardId) ?? FAKE_BOARDS[0];
  return (
    <PreviewPage>
      <Text accessibilityRole="header" style={[type.heading, { color: t.textPrimary }]}>
        {board.title}
      </Text>
      <Text style={[type.body, { color: t.textSecondary }]}>{board.blurb}</Text>
      <ProgressBar value={board.collected / board.pins.length} />
      {board.pins.map((name, i) => (
        <View key={name} style={styles.row}>
          <Icon
            name={i < board.collected ? 'bookmark-check' : 'lightbulb-on-outline'}
            size={22}
            color={t.accent}
          />
          <Text style={[type.body, styles.flex, { color: t.textPrimary }]}>{name}</Text>
          <Text style={[type.caption, { color: t.textSecondary }]}>
            {i < board.collected ? 'Collected' : 'Not yet'}
          </Text>
        </View>
      ))}
      <PrimaryButton
        label="Plan a walk past the rest"
        icon="directions"
        onPress={() => undefined}
      />
      <Text style={[type.caption, { color: t.textSecondary }]}>
        Finishing a board gives a bonus (amount still to be decided by the team).
      </Text>
    </PreviewPage>
  );
}

export function TeacherPreview() {
  const t = useAppTheme();
  const all: string[] = FAKE_BOARDS.flatMap((b) => [...b.pins]);
  const [picked, setPicked] = useState<string[]>(all.slice(0, 5));
  const toggle = (p: string) =>
    setPicked(picked.includes(p) ? picked.filter((x) => x !== p) : [...picked, p]);
  return (
    <PreviewPage>
      <Text accessibilityRole="header" style={[type.heading, { color: t.textPrimary }]}>
        Course walk: Kowloon Tong history
      </Text>
      <Card>
        <Text style={[type.small, styles.bold, { color: t.textPrimary }]}>Pins on the walk</Text>
        <View style={styles.chips}>
          {all.map((p) => (
            <Chip key={p} small label={p} selected={picked.includes(p)} onPress={() => toggle(p)} />
          ))}
        </View>
        <Text style={[type.caption, { color: t.textSecondary }]}>
          {picked.length} pins · class code KT-7Q2 (made up)
        </Text>
      </Card>
      <Card>
        <Text style={[type.small, styles.bold, { color: t.textPrimary }]}>Class progress</Text>
        {FAKE_STUDENTS.map((s) => (
          <View key={s.name} style={styles.row}>
            <Text style={[type.small, styles.studentName, { color: t.textPrimary }]}>{s.name}</Text>
            <View style={styles.flex}>
              <ProgressBar value={Math.min(1, s.done / Math.max(1, picked.length))} />
            </View>
            <Text style={[type.caption, { color: t.textSecondary }]}>
              {Math.min(s.done, picked.length)}/{picked.length}
            </Text>
          </View>
        ))}
      </Card>
      <PrimaryButton
        label="See the student's screen"
        variant="secondary"
        onPress={() => go('student')}
      />
    </PreviewPage>
  );
}

export function StudentPreview() {
  const t = useAppTheme();
  const [answer, setAnswer] = useState<string | null>(null);
  return (
    <PreviewPage>
      <Text style={[type.small, { color: t.textSecondary }]}>Class walk · stop 2 of 5</Text>
      <Text accessibilityRole="header" style={[type.title, { color: t.textPrimary }]}>
        {FAKE_QUESTION.prompt}
      </Text>
      {FAKE_QUESTION.options.map((o) => {
        const right = answer !== null && o === FAKE_QUESTION.answer;
        return (
          <Pressable
            key={o}
            accessibilityRole="button"
            onPress={() => setAnswer(o)}
            style={[
              styles.option,
              {
                borderColor: right ? t.primary : t.border,
                backgroundColor: right ? t.successSurface : t.background,
              },
            ]}
          >
            <Text style={[type.body, { color: t.textPrimary }]}>
              {right ? '✓ ' : ''}
              {o}
            </Text>
          </Pressable>
        );
      })}
      {answer ? (
        <Text accessibilityRole="alert" style={[type.small, { color: t.textPrimary }]}>
          {answer === FAKE_QUESTION.answer ? 'Right!' : 'Not quite.'} Your teacher sees that you
          reached this stop.
        </Text>
      ) : null}
    </PreviewPage>
  );
}

export function ShopPreview() {
  const t = useAppTheme();
  const rules = useFeatureRules();
  const [shown, setShown] = useState(false);
  if (!rules.shopOffers) return <PreviewPage>{null}</PreviewPage>; // never for under-18s
  return (
    <PreviewPage>
      <Card>
        <Text style={[type.small, { color: t.textSecondary }]}>{FAKE_OFFER.shop}</Text>
        <Text style={[type.title, { color: t.textPrimary }]}>{FAKE_OFFER.offer}</Text>
        <Text style={[type.caption, { color: t.textSecondary }]}>{FAKE_OFFER.unlock}</Text>
      </Card>
      {shown ? (
        <Card>
          <View style={styles.qr}>
            <QRCode value={FAKE_OFFER.code} size={180} />
          </View>
          <Text style={[type.body, styles.center, { color: t.textPrimary }]}>
            {FAKE_OFFER.code}
          </Text>
          <Text style={[type.caption, styles.center, { color: t.textSecondary }]}>
            One-time code · show it to the staff · expires in 10 minutes
          </Text>
        </Card>
      ) : (
        <PrimaryButton label="Show my one-time code" icon="qrcode" onPress={() => setShown(true)} />
      )}
      <Text style={[type.caption, { color: t.textSecondary }]}>
        Points can’t be bought, cashed out or given to someone else.
      </Text>
    </PreviewPage>
  );
}

export function StaffPreview() {
  const t = useAppTheme();
  const rules = useFeatureRules();
  const [code, setCode] = useState('');
  const [result, setResult] = useState<'valid' | 'unknown' | null>(null);
  if (!rules.shopOffers) return <PreviewPage>{null}</PreviewPage>;
  return (
    <PreviewPage>
      <Text accessibilityRole="header" style={[type.title, { color: t.textPrimary }]}>
        Check a customer’s code
      </Text>
      <TextInput
        accessibilityLabel="Code"
        value={code}
        onChangeText={(c) => {
          setCode(c);
          setResult(null);
        }}
        placeholder="Scan or type the code"
        placeholderTextColor={t.textSecondary}
        autoCapitalize="characters"
        style={[type.body, styles.input, { color: t.textPrimary, borderColor: t.border }]}
      />
      <PrimaryButton
        label="Check"
        onPress={() =>
          setResult(code.trim().toUpperCase() === FAKE_OFFER.code ? 'valid' : 'unknown')
        }
      />
      {result ? (
        <Card>
          <Text
            accessibilityRole="alert"
            style={[type.title, { color: result === 'valid' ? t.primary : t.danger }]}
          >
            {result === 'valid'
              ? 'Valid — give the offer, then mark it used'
              : 'Unknown or already used'}
          </Text>
        </Card>
      ) : null}
      <Text style={[type.caption, { color: t.textSecondary }]}>
        Try the code {FAKE_OFFER.code}.
      </Text>
    </PreviewPage>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1 },
  bold: { fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  studentName: { width: 80 },
  option: { borderWidth: 2, borderRadius: radius.md, padding: space.md },
  qr: {
    alignItems: 'center',
    padding: space.md,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
  },
  center: { textAlign: 'center' },
  input: { borderWidth: 1, borderRadius: radius.md, padding: space.md },
});
