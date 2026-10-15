/** "Edit profile": change your display name (shown on routes only when "Show my name" is on). */
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { PrimaryButton } from '@/components/ui/primary-button';
import { updateDisplayName } from '@/lib/profile';
import { radius, space, TAP_TARGET, type, useAppTheme } from '@/theme';

export function EditProfileSheet({
  visible,
  userId,
  currentName,
  onClose,
}: {
  visible: boolean;
  userId: string | null;
  currentName: string | null;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* key: reset the input each time the sheet opens */}
      {visible ? (
        <Body key={currentName ?? ''} userId={userId} currentName={currentName} onClose={onClose} />
      ) : null}
    </Modal>
  );
}

function Body({
  userId,
  currentName,
  onClose,
}: {
  userId: string | null;
  currentName: string | null;
  onClose: () => void;
}) {
  const t = useAppTheme();
  const [name, setName] = useState(currentName ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!userId) {
      setError('You’re not signed in yet — check Profile → Diagnostics.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateDisplayName(userId, name);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.backdrop, { backgroundColor: t.overlay }]}
    >
      <View style={[styles.sheet, { backgroundColor: t.background }]}>
        <Text style={[type.title, { color: t.textPrimary }]} accessibilityRole="header">
          Edit profile
        </Text>
        <Text style={[type.small, { color: t.textSecondary }]}>
          Your name appears on routes only when you turn on “Show my name”. Leave it empty to stay
          an anonymous walker.
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Display name"
          placeholderTextColor={t.textSecondary}
          maxLength={40}
          autoFocus
          accessibilityLabel="Display name"
          style={[styles.input, type.body, { color: t.textPrimary, backgroundColor: t.surface }]}
        />
        {error ? (
          <Text style={[type.small, { color: t.danger }]} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <PrimaryButton label="Save" onPress={() => void save()} loading={saving} />
        <PrimaryButton label="Cancel" variant="secondary" onPress={onClose} disabled={saving} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    padding: space.xl,
    gap: space.md,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
  },
  input: { minHeight: TAP_TARGET + 4, borderRadius: radius.md, paddingHorizontal: space.lg },
});
