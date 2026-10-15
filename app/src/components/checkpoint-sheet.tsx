/**
 * Asks for the extra details of a checkpoint: floors for lifts/escalators/stairs, text for notes.
 * Everything is optional — "Add" works with nothing filled in.
 */
import type { CheckpointKind } from '@scenic/shared';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CHECKPOINT_INFO, FLOOR_CHOICES } from '@/constants/checkpoints';
import { Spacing } from '@/constants/theme';
import { PrimaryButton } from '@/components/ui/primary-button';
import { useTheme } from '@/hooks/use-theme';
import { useAppTheme } from '@/theme';

export type CheckpointDetails = {
  floorFrom: string | null;
  floorTo: string | null;
  note: string | null;
};

export function CheckpointSheet({
  kind,
  onAdd,
  onCancel,
}: {
  /** null = sheet hidden */
  kind: CheckpointKind | null;
  onAdd: (details: CheckpointDetails) => void;
  onCancel: () => void;
}) {
  const overlay = useAppTheme().overlay;
  return (
    <Modal visible={kind !== null} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={[styles.backdrop, { backgroundColor: overlay }]}>
        {/* key resets the inputs every time the sheet opens for a new checkpoint */}
        {kind ? <SheetBody key={kind} kind={kind} onAdd={onAdd} onCancel={onCancel} /> : null}
      </View>
    </Modal>
  );
}

function SheetBody({
  kind,
  onAdd,
  onCancel,
}: {
  kind: CheckpointKind;
  onAdd: (details: CheckpointDetails) => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const info = CHECKPOINT_INFO[kind];
  const [floorFrom, setFloorFrom] = useState('');
  const [floorTo, setFloorTo] = useState('');
  const [note, setNote] = useState('');

  const clean = (s: string) => (s.trim() ? s.trim().slice(0, 10) : null);

  return (
    <ThemedView style={styles.sheet}>
      <ThemedText type="subtitle" style={styles.title}>
        {info.en} · {info.zh}
      </ThemedText>

      {info.asksFloors ? (
        <>
          <FloorRow label="From floor" value={floorFrom} onChange={setFloorFrom} />
          <FloorRow label="To floor" value={floorTo} onChange={setFloorTo} />
        </>
      ) : null}

      {info.asksNote || !info.asksFloors ? (
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={info.asksNote ? 'What should people know here?' : 'Optional note'}
          placeholderTextColor={theme.textSecondary}
          maxLength={200}
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          accessibilityLabel="Note"
        />
      ) : null}

      <PrimaryButton
        label={`Add ${info.en.toLowerCase()}`}
        icon="check"
        onPress={() =>
          onAdd({
            floorFrom: clean(floorFrom),
            floorTo: clean(floorTo),
            note: note.trim() ? note.trim() : null,
          })
        }
      />
      <PrimaryButton label="Cancel" variant="secondary" onPress={onCancel} />
    </ThemedView>
  );
}

/** Quick floor buttons (G, L1, L2…) plus a box for anything else. */
function FloorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const theme = useTheme();
  const t = useAppTheme();
  return (
    <View style={styles.floorRow}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {FLOOR_CHOICES.map((f) => {
          const selected = value === f;
          return (
            <Pressable
              key={f}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(selected ? '' : f)}
              style={[
                styles.chip,
                { backgroundColor: selected ? t.primary : theme.backgroundElement },
              ]}
            >
              <ThemedText style={selected ? { color: t.onPrimary, fontWeight: '600' } : undefined}>
                {f}
              </ThemedText>
            </Pressable>
          );
        })}
        <TextInput
          value={FLOOR_CHOICES.includes(value) ? '' : value}
          onChangeText={onChange}
          placeholder="Other"
          placeholderTextColor={theme.textSecondary}
          maxLength={10}
          autoCapitalize="characters"
          style={[
            styles.chip,
            styles.otherInput,
            { color: theme.text, backgroundColor: theme.backgroundElement },
          ]}
          accessibilityLabel={`${label}, other`}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    padding: Spacing.four,
    paddingBottom: Spacing.five,
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    gap: Spacing.three,
  },
  title: { fontSize: 24, lineHeight: 32 },
  floorRow: { gap: Spacing.two },
  chips: { gap: Spacing.two, paddingRight: Spacing.three },
  chip: {
    minWidth: 48,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otherInput: { minWidth: 80, fontSize: 16 },
  input: {
    minHeight: 48,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
});
