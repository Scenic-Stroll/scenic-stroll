/**
 * Map tab: the demo area, your location, start/destination pickers and the standard walking route
 * (drawn in grey). Community routes are added on top of this in Phase 4.
 */
import { DEMO_CENTER, formatDistance, formatDuration } from '@scenic/shared';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import MapView, {
  Marker,
  Polyline,
  type Camera,
  type LatLng as MapLatLng,
} from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { planRoute } from '@/lib/api';

import { PlacePicker } from './place-picker';
import type { Place } from './types';

const ROUTE_GREY = '#8E8E93';
const START_GREEN = '#2E7D32';
const END_RED = '#C62828';

// How far the map tilts in 3D mode (0 = flat, top-down). 55° shows buildings as 3D blocks
// while street names stay readable.
const PITCH_3D = 55;

// Starting view: CityU, Festival Walk and Kowloon Tong station on screen, tilted in 3D.
// `altitude` (metres above ground) is used by Apple Maps on iPhone, `zoom` by Google Maps on Android.
const DEMO_CAMERA: Camera = {
  center: { latitude: DEMO_CENTER.lat, longitude: DEMO_CENTER.lng },
  pitch: PITCH_3D,
  heading: 0,
  altitude: 900,
  zoom: 17,
};

const toMap = (p: { lat: number; lng: number }): MapLatLng => ({
  latitude: p.lat,
  longitude: p.lng,
});

export function MapHome() {
  const theme = useTheme();
  const mapRef = useRef<MapView>(null);
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [picking, setPicking] = useState<'origin' | 'destination' | null>(null);
  const [hasLocationPermission, setHasLocationPermission] = useState(false);
  const [is3D, setIs3D] = useState(true);

  // Tilt the camera in/out of 3D without moving the map.
  const toggle3D = () => {
    const next = !is3D;
    setIs3D(next);
    mapRef.current?.animateCamera({ pitch: next ? PITCH_3D : 0 }, { duration: 400 });
  };

  // Ask for location once, so the blue "you are here" dot can show.
  useEffect(() => {
    Location.requestForegroundPermissionsAsync()
      .then(({ granted }) => setHasLocationPermission(granted))
      .catch(() => setHasLocationPermission(false));
  }, []);

  // The standard walking route. Re-fetched automatically when start or destination change.
  const route = useQuery({
    queryKey: ['plan-route', origin?.point, destination?.point],
    queryFn: () => planRoute(origin!.point, destination!.point),
    enabled: origin !== null && destination !== null,
    staleTime: 10 * 60 * 1000, // walking routes don't change minute to minute
    retry: 1,
  });

  // Zoom the map to fit the route when it arrives.
  useEffect(() => {
    if (!route.data) return;
    mapRef.current?.fitToCoordinates(route.data.coordinates.map(toMap), {
      edgePadding: { top: 220, right: 60, bottom: 260, left: 60 },
      animated: true,
    });
  }, [route.data]);

  const swap = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialCamera={DEMO_CAMERA}
        showsBuildings // 3D building blocks (Apple Maps on iPhone, Google Maps on Android)
        pitchEnabled // two-finger drag up/down tilts the map
        showsUserLocation={hasLocationPermission}
        showsMyLocationButton={false}
        // Long-press anywhere to set a destination there.
        onLongPress={(e) => {
          const { latitude, longitude } = e.nativeEvent.coordinate;
          setDestination({ label: 'Dropped pin', point: { lat: latitude, lng: longitude } });
        }}
      >
        {route.data ? (
          <Polyline
            coordinates={route.data.coordinates.map(toMap)}
            strokeColor={ROUTE_GREY}
            strokeWidth={6}
          />
        ) : null}
        {origin ? (
          <Marker
            coordinate={toMap(origin.point)}
            title={`Start: ${origin.label}`}
            pinColor={START_GREEN}
          />
        ) : null}
        {destination ? (
          <Marker
            coordinate={toMap(destination.point)}
            title={`Destination: ${destination.label}`}
            pinColor={END_RED}
          />
        ) : null}
      </MapView>

      {/* Start / destination card */}
      <SafeAreaView edges={['top']} style={styles.topOverlay} pointerEvents="box-none">
        <ThemedView type="background" style={[styles.card, styles.shadow]}>
          <View style={styles.fields}>
            <PlaceField
              color={START_GREEN}
              label="From"
              value={origin?.label}
              placeholder="Choose start"
              onPress={() => setPicking('origin')}
            />
            <PlaceField
              color={END_RED}
              label="To"
              value={destination?.label}
              placeholder="Choose destination"
              onPress={() => setPicking('destination')}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Swap start and destination"
            onPress={swap}
            style={styles.swap}
            hitSlop={8}
          >
            <ThemedText type="subtitle" style={styles.swapIcon}>
              ⇅
            </ThemedText>
          </Pressable>
        </ThemedView>
      </SafeAreaView>

      {/* Route summary */}
      <View style={styles.bottomOverlay} pointerEvents="box-none">
        <View style={styles.mapButtons}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={is3D ? 'Switch to flat 2D map' : 'Switch to 3D map'}
            onPress={toggle3D}
            style={[styles.recenter, styles.shadow, { backgroundColor: theme.background }]}
          >
            <ThemedText type="smallBold">{is3D ? '2D' : '3D'}</ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show the CityU demo area"
            onPress={() => {
              setIs3D(true);
              mapRef.current?.animateCamera(DEMO_CAMERA, { duration: 400 });
            }}
            style={[styles.recenter, styles.shadow, { backgroundColor: theme.background }]}
          >
            <ThemedText type="smallBold">CityU</ThemedText>
          </Pressable>
        </View>
        <RouteSummary
          state={
            origin === null || destination === null
              ? { kind: 'hint' }
              : route.isPending
                ? { kind: 'loading' }
                : route.error
                  ? { kind: 'error', message: route.error.message, retry: () => route.refetch() }
                  : route.data
                    ? {
                        kind: 'route',
                        text: `${formatDuration(route.data.duration_s)} · ${formatDistance(route.data.distance_m)}`,
                      }
                    : { kind: 'hint' }
          }
        />
      </View>

      <PlacePicker
        visible={picking !== null}
        title={picking === 'origin' ? 'Start from' : 'Go to'}
        allowCurrentLocation={picking === 'origin'}
        onClose={() => setPicking(null)}
        onPick={(place) => {
          if (picking === 'origin') setOrigin(place);
          else setDestination(place);
          setPicking(null);
        }}
      />
    </View>
  );
}

function PlaceField({
  color,
  label,
  value,
  placeholder,
  onPress,
}: {
  color: string;
  label: string;
  value: string | undefined;
  placeholder: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value ?? placeholder}`}
      onPress={onPress}
      style={styles.field}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
        {label}
      </ThemedText>
      <ThemedText
        numberOfLines={1}
        themeColor={value ? 'text' : 'textSecondary'}
        style={styles.fieldValue}
      >
        {value ?? placeholder}
      </ThemedText>
    </Pressable>
  );
}

type SummaryState =
  | { kind: 'hint' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string; retry: () => void }
  | { kind: 'route'; text: string };

function RouteSummary({ state }: { state: SummaryState }) {
  return (
    <ThemedView type="background" style={[styles.card, styles.summary, styles.shadow]}>
      {state.kind === 'hint' ? (
        <ThemedText type="small" themeColor="textSecondary">
          Choose a start and destination — or long-press the map to drop a pin.
        </ThemedText>
      ) : null}
      {state.kind === 'loading' ? (
        <View style={styles.inline}>
          <ActivityIndicator />
          <ThemedText type="small">Finding the standard walking route…</ThemedText>
        </View>
      ) : null}
      {state.kind === 'error' ? (
        <View style={styles.summaryError}>
          <ThemedText type="small">Couldn’t get a route: {state.message}</ThemedText>
          <Pressable
            accessibilityRole="button"
            onPress={state.retry}
            hitSlop={8}
            style={styles.retry}
          >
            <ThemedText type="linkPrimary">Try again</ThemedText>
          </Pressable>
        </View>
      ) : null}
      {state.kind === 'route' ? (
        <View style={styles.inline}>
          <View style={[styles.legend, { backgroundColor: ROUTE_GREY }]} />
          <View>
            <ThemedText type="smallBold">Standard walk</ThemedText>
            <ThemedText>{state.text}</ThemedText>
          </View>
        </View>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topOverlay: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: Spacing.three },
  bottomOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: BottomTabInset + Spacing.three,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
    alignItems: 'flex-end',
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  shadow: {
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  fields: { flex: 1, gap: Spacing.one },
  field: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 10, height: 10, borderRadius: 5 },
  fieldLabel: { width: 40 },
  fieldValue: { flex: 1 },
  swap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  swapIcon: { fontSize: 24, lineHeight: 30 },
  mapButtons: { flexDirection: 'row', gap: Spacing.two },
  recenter: {
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: 22,
    justifyContent: 'center',
  },
  summary: { alignSelf: 'stretch', marginTop: 0 },
  summaryError: { flex: 1, gap: Spacing.one },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  legend: { width: 6, alignSelf: 'stretch', borderRadius: 3 },
});
