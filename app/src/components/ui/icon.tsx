import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

/** Any MaterialCommunityIcons name (open icon set bundled in Expo Go). */
export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export function Icon({
  name,
  size = 22,
  color,
}: {
  name: IconName;
  size?: number;
  color: ColorValue;
}) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}
