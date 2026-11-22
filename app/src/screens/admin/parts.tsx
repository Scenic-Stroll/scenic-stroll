// Small building blocks for the admin area (/admin, D53): plain, keyboard-friendly, web-first.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { radius, space, type, useAppTheme } from '@/theme';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const t = useAppTheme();
  return (
    <View style={[styles.section, { borderColor: t.border }]}>
      <Text accessibilityRole="header" style={[type.title, { color: t.textPrimary }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

export function Field({
  label,
  hint,
  ...input
}: TextInputProps & { label: string; hint?: string }) {
  const t = useAppTheme();
  return (
    <View style={styles.field}>
      <Text style={[type.small, styles.bold, { color: t.textPrimary }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={t.textSecondary}
        {...input}
        style={[
          type.body,
          styles.input,
          input.multiline ? styles.multiline : null,
          { color: t.textPrimary, backgroundColor: t.surface, borderColor: t.border },
        ]}
      />
      {hint ? <Text style={[type.caption, { color: t.textSecondary }]}>{hint}</Text> : null}
    </View>
  );
}

export function Button({
  label,
  onPress,
  tone = 'normal',
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  tone?: 'normal' | 'primary' | 'danger';
  disabled?: boolean;
}) {
  const t = useAppTheme();
  const bg = tone === 'primary' ? t.primary : tone === 'danger' ? t.dangerSurface : t.surface;
  const fg = tone === 'primary' ? t.onPrimary : tone === 'danger' ? t.danger : t.textPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: t.border, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
      ]}
    >
      <Text style={[type.small, styles.bold, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Badge({
  text,
  tone = 'neutral',
}: {
  text: string;
  tone?: 'neutral' | 'ok' | 'warn';
}) {
  const t = useAppTheme();
  const bg = tone === 'ok' ? t.successSurface : tone === 'warn' ? t.warningSurface : t.surface;
  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor: t.border }]}>
      <Text style={[type.caption, styles.bold, { color: t.textPrimary }]}>{text}</Text>
    </View>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

export function ErrorText({ text }: { text: string | null }) {
  const t = useAppTheme();
  if (!text) return null;
  return (
    <Text accessibilityRole="alert" style={[type.small, { color: t.danger }]}>
      {text}
    </Text>
  );
}

export const STATUS_TEXT: Record<string, { text: string; tone: 'neutral' | 'ok' | 'warn' }> = {
  draft: { text: 'Draft', tone: 'neutral' },
  in_review: { text: 'In review', tone: 'warn' },
  approved: { text: 'Approved', tone: 'ok' },
  live: { text: 'Live', tone: 'ok' },
  paused: { text: 'Paused', tone: 'neutral' },
};

const styles = StyleSheet.create({
  section: { gap: space.md, padding: space.lg, borderWidth: 1, borderRadius: radius.md },
  field: { gap: space.xs },
  bold: { fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: radius.md, padding: space.md },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
  button: {
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  badge: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
});
