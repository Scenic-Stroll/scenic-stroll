// Web version of watchPosition (watch-position.ts). DECISIONS D48.
//
// Why not expo-location here: its web version files each callback under its own counter but
// labels every position with the *browser's* watch number. Once anything else watches the position
// (the blue "you are here" dot on the map does), the two numbers differ, the positions go to no
// one, and expo-location even cancels the watch. Recording then sat at "Waiting for GPS…" forever.
// Found by the end-to-end test e2e/record-offline.spec.ts.
import type * as Location from 'expo-location';

/** Same shape as expo-location's: call `remove()` to stop. */
export async function watchPosition(
  options: Location.LocationOptions,
  callback: Location.LocationCallback,
  onError?: Location.LocationErrorCallback,
): Promise<Location.LocationSubscription> {
  const id = navigator.geolocation.watchPosition(
    (pos) =>
      void callback({
        coords: {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          altitude: pos.coords.altitude,
          accuracy: pos.coords.accuracy,
          altitudeAccuracy: pos.coords.altitudeAccuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
        },
        timestamp: pos.timestamp,
      }),
    (err) => onError?.(err.message),
    {
      enableHighAccuracy: (options.accuracy ?? 0) >= 4, // High and better: use GPS
      maximumAge: options.timeInterval ?? 0,
    },
  );
  return { remove: () => navigator.geolocation.clearWatch(id) };
}
