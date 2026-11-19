// The blue "you are here" dot on the web map (react-native-maps draws it for us on the phones).
// Uses the browser's location, which only works on HTTPS pages and after the user allows it.
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import type { MapLatLng } from './camera';
import { Marker } from './marker';

export function UserDot() {
  const [here, setHere] = useState<MapLatLng | null>(null);

  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const watch = navigator.geolocation.watchPosition(
      (pos) => setHere({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => setHere(null), // denied or no fix: just don't show the dot
      { enableHighAccuracy: true, maximumAge: 10_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  if (!here) return null;
  return (
    <Marker coordinate={here} accessibilityLabel="Your location" zIndex={10}>
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          backgroundColor: '#1A73E8',
          borderWidth: 3,
          borderColor: '#fff',
          boxShadow: '0 0 0 6px rgba(26,115,232,0.2)',
        }}
      />
    </Marker>
  );
}
