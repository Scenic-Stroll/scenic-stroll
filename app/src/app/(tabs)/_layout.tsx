/**
 * Bottom tab bar: Map · Routes · Record · Friends · Profile.
 * White bar, thin top border, green active tab; Record is a raised round green button in the centre.
 */
import { Tabs } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, View, type ColorValue } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { useRecorder } from '@/lib/recorder';
import { radius, shadow, TAP_TARGET, useAppTheme } from '@/theme';

export default function TabsLayout() {
  const t = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.textSecondary,
        tabBarStyle: {
          backgroundColor: t.background,
          borderTopColor: t.border,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
        tabBarLabelStyle: { fontSize: 12 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Map',
          tabBarIcon: (p) => <TabIcon {...p} outline="map-outline" filled="map" />,
        }}
      />
      <Tabs.Screen
        name="routes"
        options={{
          title: 'Routes',
          tabBarIcon: (p) => <TabIcon {...p} outline="map-marker-path" filled="map-marker-path" />,
        }}
      />
      <Tabs.Screen
        name="record"
        options={{
          title: 'Record',
          tabBarLabel: () => null,
          tabBarAccessibilityLabel: 'Record a route',
          tabBarButton: (props) => <RecordTabButton onPress={props.onPress} />,
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: 'Friends',
          tabBarIcon: (p) => (
            <TabIcon {...p} outline="account-multiple-outline" filled="account-multiple" />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: (p) => (
            <TabIcon {...p} outline="account-circle-outline" filled="account-circle" />
          ),
        }}
      />
    </Tabs>
  );
}

/** Outline icon normally, filled when the tab is active. */
function TabIcon({
  focused,
  color,
  outline,
  filled,
}: {
  focused: boolean;
  color: ColorValue;
  outline: IconName;
  filled: IconName;
}) {
  return <Icon name={focused ? filled : outline} size={24} color={color} />;
}

/** The big round centre button. Turns red with a stop icon while a recording is running. */
function RecordTabButton({ onPress }: { onPress?: (e: never) => void }) {
  const t = useAppTheme();
  const recording = useRecorder((s) => s.status !== 'idle');
  return (
    <View style={styles.slot}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={recording ? 'Recording in progress — open recorder' : 'Record a route'}
        onPress={(e) => onPress?.(e as never)}
        style={({ pressed }) => [
          styles.recordButton,
          shadow,
          {
            backgroundColor: recording ? t.danger : pressed ? t.primaryPressed : t.primary,
            borderColor: t.background,
          },
        ]}
      >
        <Icon name={recording ? 'record-circle' : 'record-rec'} size={32} color={t.onPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { flex: 1, alignItems: 'center' },
  recordButton: {
    width: TAP_TARGET + 16,
    height: TAP_TARGET + 16,
    borderRadius: radius.round,
    borderWidth: 4,
    marginTop: -18, // raised above the bar
    alignItems: 'center',
    justifyContent: 'center',
  },
});
