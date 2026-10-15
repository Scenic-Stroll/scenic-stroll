/**
 * Clean, light base map: muted roads, soft green parks, fewer shop icons, so our green routes and
 * checkpoints stand out.
 *
 * How it applies per platform (react-native-maps in Expo Go):
 *  - Android (Google Maps): these JSON styles via `customMapStyle`.
 *  - iOS (Apple Maps): custom JSON styles aren't supported, so we use `mapType="mutedStandard"`
 *    (Apple's muted, low-clutter style) + `userInterfaceStyle` for light/dark.
 */
import type { MapStyleElement } from 'react-native-maps';

export const LIGHT_MAP_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#F4F5F7' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#5F6368' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  {
    featureType: 'poi',
    elementType: 'labels.icon',
    stylers: [{ saturation: -70 }, { lightness: 20 }],
  },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#D9EFD9' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#E3E5E8' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#ECEEF1' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#D5D8DC' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#CFE3F5' }] },
];

export const DARK_MAP_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#1E2023' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#A3A8B0' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#121314' }] },
  {
    featureType: 'poi',
    elementType: 'labels.icon',
    stylers: [{ saturation: -70 }, { lightness: -30 }],
  },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1F3324' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2E3135' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#25282B' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#3A3D42' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#14263A' }] },
];
