/** Full-screen camera that reads a friend's QR code. Asks for camera permission first. */
import { parseFriendCode } from '@scenic/shared';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef } from 'react';
import { Linking, Modal, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/ui/primary-button';
import { radius, space, type, useAppTheme } from '@/theme';

export function QrScanner({
  visible,
  onCode,
  onClose,
}: {
  visible: boolean;
  onCode: (code: string) => void;
  onClose: () => void;
}) {
  const t = useAppTheme();
  const [permission, requestPermission] = useCameraPermissions();
  // The camera reports the same QR many times per second; act on it once.
  const handled = useRef(false);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      onShow={() => (handled.current = false)}
    >
      <SafeAreaView style={[styles.fill, { backgroundColor: '#000' }]}>
        {!permission ? null : !permission.granted ? (
          <View style={[styles.center, { backgroundColor: t.background }]}>
            <Text style={[type.title, styles.text, { color: t.textPrimary }]}>
              Camera access needed
            </Text>
            <Text style={[type.small, styles.text, { color: t.textSecondary }]}>
              Scanning a friend’s QR code needs the camera. Nothing is recorded or uploaded.
            </Text>
            {permission.canAskAgain ? (
              <PrimaryButton
                label="Allow camera"
                icon="camera-outline"
                onPress={() => void requestPermission()}
              />
            ) : (
              <PrimaryButton
                label="Open phone settings"
                onPress={() => void Linking.openSettings()}
              />
            )}
            <PrimaryButton label="Cancel" variant="secondary" onPress={onClose} />
          </View>
        ) : (
          <View style={styles.fill}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => {
                if (handled.current) return;
                const code = parseFriendCode(data);
                if (code) {
                  handled.current = true;
                  onCode(code);
                }
              }}
            />
            <View style={styles.overlay} pointerEvents="box-none">
              <View style={styles.frame} />
              <Text style={[type.body, styles.hint]}>
                Point the camera at your friend’s Scenic Stroll QR code
              </Text>
              <View style={styles.cancel}>
                <PrimaryButton label="Cancel" variant="secondary" onPress={onClose} />
              </View>
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', padding: space.xl, gap: space.md },
  text: { textAlign: 'center' },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xl,
    padding: space.xl,
  },
  frame: {
    width: 240,
    height: 240,
    borderRadius: radius.md,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  hint: { color: '#FFFFFF', textAlign: 'center' },
  cancel: { alignSelf: 'stretch' },
});
