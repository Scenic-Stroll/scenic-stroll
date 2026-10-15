/**
 * Add friend: show my code + QR, share an invite, type a friend's code, or scan their QR.
 */
import { friendInviteText, friendLink, parseFriendCode } from '@scenic/shared';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { PrimaryButton } from '@/components/ui/primary-button';
import { SEND_RESULT_MESSAGE, sendFriendRequest, useMyFriendCode } from '@/lib/friends';
import { radius, space, TAP_TARGET, type, useAppTheme } from '@/theme';

import { QrScanner } from './qr-scanner';

export function AddFriendSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {visible ? <Body onClose={onClose} /> : null}
    </Modal>
  );
}

function Body({ onClose }: { onClose: () => void }) {
  const t = useAppTheme();
  const myCode = useMyFriendCode();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [scanning, setScanning] = useState(false);

  const submit = async (raw: string) => {
    const code = parseFriendCode(raw);
    if (!code) {
      setMessage({ ok: false, text: 'That doesn’t look like a friend code (e.g. STROLL-7K2Q).' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await sendFriendRequest(code);
      setMessage({ ok: true, text: SEND_RESULT_MESSAGE[result] });
      setInput('');
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.backdrop, { backgroundColor: t.overlay }]}
    >
      <View style={[styles.sheet, { backgroundColor: t.background }]}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[type.title, { color: t.textPrimary }]} accessibilityRole="header">
            Add friend
          </Text>

          {/* My code */}
          <View style={[styles.codeCard, { backgroundColor: t.surface }]}>
            <Text style={[type.small, { color: t.textSecondary }]}>Your friend code</Text>
            {myCode.isPending ? <ActivityIndicator /> : null}
            {myCode.error ? (
              <Text style={[type.small, { color: t.danger }]}>{myCode.error.message}</Text>
            ) : null}
            {myCode.data ? (
              <>
                <Text
                  style={[styles.code, { color: t.textPrimary }]}
                  selectable
                  accessibilityLabel={`Your friend code: ${myCode.data.split('').join(' ')}`}
                >
                  {myCode.data}
                </Text>
                {/* QR on white with black modules so every scanner can read it, in both themes. */}
                <View style={styles.qrBox} accessibilityLabel="QR code with your friend code">
                  <QRCode
                    value={friendLink(myCode.data)}
                    size={168}
                    color="#000000"
                    backgroundColor="#FFFFFF"
                  />
                </View>
                <PrimaryButton
                  label="Share invite"
                  icon="share-variant-outline"
                  variant="secondary"
                  onPress={() =>
                    void Share.share({ message: friendInviteText(myCode.data!) }).catch(
                      () => undefined,
                    )
                  }
                />
              </>
            ) : null}
          </View>

          {/* Their code */}
          <Text style={[type.body, { color: t.textPrimary, fontWeight: '600' }]}>Add someone</Text>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Enter their code, e.g. STROLL-7K2Q"
            placeholderTextColor={t.textSecondary}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="send"
            onSubmitEditing={() => void submit(input)}
            accessibilityLabel="Friend code"
            style={[styles.input, type.body, { color: t.textPrimary, backgroundColor: t.surface }]}
          />
          {message ? (
            <Text
              style={[type.small, { color: message.ok ? t.primary : t.danger }]}
              accessibilityLiveRegion="polite"
            >
              {message.text}
            </Text>
          ) : null}
          <PrimaryButton
            label="Send request"
            icon="account-plus"
            onPress={() => void submit(input)}
            loading={busy}
          />
          <PrimaryButton
            label="Scan their QR code"
            icon="qrcode-scan"
            variant="secondary"
            onPress={() => setScanning(true)}
          />
          <PrimaryButton label="Done" variant="secondary" onPress={onClose} />
        </ScrollView>
      </View>

      <QrScanner
        visible={scanning}
        onClose={() => setScanning(false)}
        onCode={(code) => {
          setScanning(false);
          setInput(code);
          void submit(code);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '92%',
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
  },
  content: { padding: space.xl, gap: space.md },
  codeCard: { borderRadius: radius.md, padding: space.lg, gap: space.md, alignItems: 'center' },
  code: { fontSize: 28, fontWeight: '700', letterSpacing: 2 },
  qrBox: { padding: space.md, backgroundColor: '#FFFFFF', borderRadius: radius.md },
  input: { minHeight: TAP_TARGET + 4, borderRadius: radius.md, paddingHorizontal: space.lg },
});
