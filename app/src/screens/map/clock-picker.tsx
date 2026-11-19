// The "At…" clock for choosing when you'll leave (phones). clock-picker.web.tsx is the browser
// version: the native clock picker doesn't exist on web.
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Platform, Pressable, Text, View } from 'react-native';

import { styles } from './clock-picker.styles';
import { type, useAppTheme } from '@/theme';

export function ClockPicker({
  value,
  onPick,
  onClose,
}: {
  value: Date;
  onPick: (picked: Date) => void;
  onClose: () => void;
}) {
  const t = useAppTheme();
  const onClock = (event: DateTimePickerEvent, picked?: Date) => {
    // Android shows a dialog that closes itself; iOS shows an inline clock we close with "Done".
    if (Platform.OS === 'android') onClose();
    if (event.type !== 'set' || !picked) return;
    onPick(picked);
  };
  return (
    <View>
      <DateTimePicker
        value={value}
        mode="time"
        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
        onChange={onClock}
      />
      {Platform.OS === 'ios' ? (
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.done}>
          <Text style={[type.body, { color: t.primary, fontWeight: '600' }]}>Done</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
