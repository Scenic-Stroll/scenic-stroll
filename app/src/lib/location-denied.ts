// What to tell people when they've said no to location access — the fix differs between the
// phone apps (system settings) and a browser (the site's permission next to the address bar),
// and everything except "start from my location" still works without it.
import { Platform } from 'react-native';

export function locationDeniedMessage(): string {
  const fix =
    Platform.OS === 'web'
      ? 'Location is blocked for this site. Allow it in your browser’s site settings (the icon next to the address bar).'
      : 'Location permission is off. Turn it on in your phone settings.';
  const instead =
    Platform.OS === 'web'
      ? 'Or pick a start from the list, or right-click / long-press the map to drop a pin.'
      : 'Or pick a start from the list, or long-press the map to drop a pin.';
  return `${fix} ${instead}`;
}
