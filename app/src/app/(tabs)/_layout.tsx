/**
 * Bottom tab bar: Map · Explore · My collection · Friends · Profile (D56).
 * White bar, thin top border, green active tab; My collection is a raised round green button in the
 * centre (knowledge pins, D54). Record is reachable from the map, not a tab.
 */
import { Tabs } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, Text, View, type ColorValue } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { useCollection } from '@/lib/pin-collection';
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
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: (p) => <TabIcon {...p} outline="compass-outline" filled="compass" />,
        }}
      />
      <Tabs.Screen
        name="collection"
        options={{
          title: 'My collection',
          tabBarLabel: () => null,
          tabBarAccessibilityLabel: 'My collection',
          tabBarButton: (props) => <CollectionTabButton onPress={props.onPress} />,
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

/** The big round centre button: My collection, with the number of unread pins. */
function CollectionTabButton({ onPress }: { onPress?: (e: never) => void }) {
  const t = useAppTheme();
  const unread = useCollection((s) => Object.values(s.pins).filter((p) => !p.readAt).length);
  return (
    <View style={styles.slot}>
      <Pressable
        // "tab": it sits in the tab bar and opens a tab (a "button" inside a tab list breaks
        // screen readers' tab navigation — Lighthouse accessibility, D48).
        accessibilityRole="tab"
        accessibilityLabel={unread > 0 ? `My collection, ${unread} unread` : 'My collection'}
        onPress={(e) => onPress?.(e as never)}
        style={({ pressed }) => [
          styles.recordButton,
          shadow,
          { backgroundColor: pressed ? t.primaryPressed : t.primary, borderColor: t.background },
        ]}
      >
        <Icon name="bookmark-multiple" size={28} color={t.onPrimary} />
        {unread > 0 ? (
          <View style={[styles.badge, { backgroundColor: t.danger, borderColor: t.background }]}>
            <Text style={[styles.badgeText, { color: t.onDanger }]}>
              {unread > 9 ? '9+' : unread}
            </Text>
          </View>
        ) : null}
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
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
});
