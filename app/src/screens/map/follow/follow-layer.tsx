/**
 * What the map shows while walking: only the route you're on (computed routes in their coloured
 * stretches), the destination, and — with the demo walker on — the simulated "you are here".
 * Real GPS uses the map's own blue dot.
 */
import type { LatLng } from '@scenic/shared';
import { StyleSheet, View } from 'react-native';
import { Marker, Polyline } from 'react-native-maps';

import { useFollow, useFollowDemo } from '@/lib/follow-store';
import { useAppTheme } from '@/theme';

import { SmartRouteLine } from '../smart-route-line';

const toMap = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng });

export function FollowLayer() {
  const t = useAppTheme();
  const s = useFollow((st) => st.session);
  const simulate = useFollowDemo((d) => d.simulateWalk);
  if (!s) return null;
  const { route } = s;
  return (
    <>
      {route.option ? (
        <SmartRouteLine option={route.option} selected onPress={() => undefined} />
      ) : (
        <Polyline
          coordinates={route.coordinates.map(toMap)}
          strokeColor={t.routeStandard}
          strokeWidth={8}
          zIndex={2}
        />
      )}
      <Marker
        coordinate={toMap(s.destination)}
        title={`Destination: ${s.destinationLabel}`}
        pinColor={t.danger}
      />
      {simulate && s.here ? (
        <Marker
          coordinate={toMap(s.here)}
          anchor={{ x: 0.5, y: 0.5 }}
          accessibilityLabel="You (simulated walk)"
          zIndex={10}
        >
          <View
            style={[styles.me, { backgroundColor: t.routeCovered, borderColor: t.background }]}
          />
        </Marker>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  me: { width: 20, height: 20, borderRadius: 10, borderWidth: 3 },
});
