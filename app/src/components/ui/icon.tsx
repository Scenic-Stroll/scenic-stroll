import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

/** Any MaterialCommunityIcons name (open icon set bundled in Expo Go). */
export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
type IconColor = ComponentProps<typeof MaterialCommunityIcons>['color'];

export function Icon({
  name,
  size = 22,
  color,
}: {
  name: IconName;
  size?: number;
  color: ColorValue;
}) {
  // Same colour at runtime; since React Native 0.88 the icon set's colour type is narrower than
  // ColorValue (which our theme and the tab bar use), so we convert it here, in one place.
  return <MaterialCommunityIcons name={name} size={size} color={color as IconColor} />;
}
