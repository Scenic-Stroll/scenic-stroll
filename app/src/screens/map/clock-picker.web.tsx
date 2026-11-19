// Browser version of the "At…" clock (clock-picker.tsx): the browser's own time input, which
// shows a proper time picker on phones and works with the keyboard on computers.
import { Pressable, Text, View } from 'react-native';

import { styles } from './clock-picker.styles';
import { space, type, useAppTheme } from '@/theme';

const pad = (n: number) => String(n).padStart(2, '0');

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
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <input
        type="time"
        aria-label="Leave at"
        defaultValue={`${pad(value.getHours())}:${pad(value.getMinutes())}`}
        onChange={(e) => {
          const [h, m] = e.target.value.split(':').map(Number);
          if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return;
          const picked = new Date();
          picked.setHours(h, m, 0, 0);
          onPick(picked);
        }}
        style={{
          fontSize: 16, // 16 px or more stops iPhone Safari zooming in on focus
          padding: 8,
          borderRadius: 8,
          border: `1px solid ${String(t.border)}`,
          background: String(t.surface),
          color: String(t.textPrimary),
        }}
      />
      <Pressable accessibilityRole="button" onPress={onClose} style={styles.done}>
        <Text style={[type.body, { color: t.primary, fontWeight: '600' }]}>Done</Text>
      </Pressable>
    </View>
  );
}
