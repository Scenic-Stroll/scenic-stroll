// Follow the device's position. Phones: expo-location, as before. The web version
// (watch-position.web.ts) talks to the browser directly — see there for why. DECISIONS D48.
import * as Location from 'expo-location';

export const watchPosition: typeof Location.watchPositionAsync = (options, callback, onError) =>
  Location.watchPositionAsync(options, callback, onError);
