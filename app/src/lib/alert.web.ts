// Browser version of showAlert (alert.ts). React Native's Alert does nothing on web, which would
// make "Delete", "Stop recording" etc. silently fail, so we use the browser's own dialogs:
// a message → window.alert; Cancel + one action → window.confirm, then run that action.
import type { AlertButton } from 'react-native';

export function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
  const text = message ? `${title}\n\n${message}` : title;
  const action = buttons?.find((b) => b.style !== 'cancel');
  const cancel = buttons?.find((b) => b.style === 'cancel');
  if (!action) {
    window.alert(text);
    return;
  }
  if (!cancel) {
    // Only one button (e.g. "OK" with a follow-up): show the message, then run it.
    window.alert(text);
    void action.onPress?.();
    return;
  }
  if (window.confirm(text)) void action.onPress?.();
  else cancel.onPress?.();
}
