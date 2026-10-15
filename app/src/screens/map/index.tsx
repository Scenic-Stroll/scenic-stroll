/**
 * Map tab (city-map-app layout):
 *   top    — floating search bar (+ avatar → Profile) and filter chips
 *   right  — zoom, my location, layers
 *   bottom — sheet with 3 snap points: "Nearby" community routes, or route planning
 * Light base map by default (2D); 3D is a layer toggle.
 */
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import {
  DEMO_CENTER,
  FILTERS,
  floorsFromCheckpoints,
  haversineMeters,
  isOnFloor,
  matchesFilters,
  PRESETS,
  type CommunityRoute,
  type FilterKey,
  type LatLng,
} from '@scenic/shared';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, {
  Marker,
  Polyline,
  type Camera,
  type LatLng as MapLatLng,
} from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { Chip } from '@/components/ui/chip';
import { Icon, type IconName } from '@/components/ui/icon';
import { SearchBar } from '@/components/ui/search-bar';
import { planRoute } from '@/lib/api';
import { communityKeys, fetchCommunityRoutes } from '@/lib/community-routes';
import { friendAsPlace, stopSharing, useFriendLocations, useSharing } from '@/lib/location-sharing';
import { useCheckpointsNear } from '@/lib/checkpoints-near';
import { useMapFocus } from '@/lib/map-focus-store';
import { CHECKPOINT_INFO, describeCheckpoint } from '@/constants/checkpoints';
import { ShareLocationSheet } from '@/screens/friends/share-location-sheet';
import { useMyProfile } from '@/lib/profile';
import { radius, shadow, space, TAP_TARGET, type, useAppTheme, useColorSchemeName } from '@/theme';

import { FloorSelector } from './floor-selector';
import { MapControls, type MapLayers } from './map-controls';
import { DARK_MAP_STYLE, LIGHT_MAP_STYLE } from './map-style';
import { NearbySheet } from './nearby-sheet';
import { PlacePicker } from './place-picker';
import { PlaceSheet } from './place-sheet';
import { PlanningSheet, STANDARD_OPTION_ID, type RouteMode } from './planning-sheet';
import type { Place } from './types';

const PITCH_3D = 55;
const SNAP_POINTS = ['15%', '50%', '90%'];
const SHEET_PEEK = 0;
const SHEET_HALF = 1;
const SHEET_FULL = 2;
/** Map span (degrees of latitude) below which we count as "zoomed into a building" (~400 m). */
const BUILDING_ZOOM_DELTA = 0.0036;
/** The map centre must be this close to a building for its floors to show. */
const BUILDING_FOCUS_METERS = 150;

// CityU, Festival Walk and Kowloon Tong station on screen, flat (2D) by default.
const DEMO_CAMERA: Camera = {
  center: { latitude: DEMO_CENTER.lat, longitude: DEMO_CENTER.lng },
  pitch: 0,
  heading: 0,
  altitude: 1100, // Apple Maps
  zoom: 16.5, // Google Maps
};

const toMap = (p: LatLng): MapLatLng => ({ latitude: p.lat, longitude: p.lng });

export function MapHome() {
  const t = useAppTheme();
  const scheme = useColorSchemeName();
  const mapRef = useRef<MapView>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const profile = useMyProfile();
  const friendLocations = useFriendLocations();
  const sharingOn = useSharing((s) => s.status === 'on');
  const [sharingSheetOpen, setSharingSheetOpen] = useState(false);

  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [picking, setPicking] = useState<'origin' | 'destination' | null>(null);
  const [planning, setPlanning] = useState(false);
  const [mode, setMode] = useState<RouteMode>('fastest');
  const [filters, setFilters] = useState<ReadonlySet<FilterKey>>(new Set());
  const [layers, setLayers] = useState<MapLayers>({
    threeD: false,
    communityRoutes: true,
    places: true,
  });
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  /** The place card being shown (landmark, search result or dropped pin). */
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  /** The route option chosen in the planning sheet (shows its directions). */
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  /** Where the place picker's result goes: the search bar opens a place card instead of routing. */
  const [pickerFromSearchBar, setPickerFromSearchBar] = useState(false);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  // Floor selector: the building you're zoomed into (Festival Walk or a CityU building), and the
  // floor picked for it (null = all floors). The floor is remembered per building.
  const [focusedBuildingId, setFocusedBuildingId] = useState<string | null>(null);
  const [floorByBuilding, setFloorByBuilding] = useState<Record<string, string | null>>({});
  const focusedBuilding = PRESETS.find((p) => p.id === focusedBuildingId) ?? null;
  const nearCheckpoints = useCheckpointsNear(focusedBuildingId, focusedBuilding?.point ?? null);
  const floors = useMemo(
    () => floorsFromCheckpoints(nearCheckpoints.data ?? []),
    [nearCheckpoints.data],
  );
  const selectedFloor = focusedBuildingId ? (floorByBuilding[focusedBuildingId] ?? null) : null;
  const visibleCheckpoints = (nearCheckpoints.data ?? []).filter(
    (c) => selectedFloor === null || isOnFloor(c, selectedFloor),
  );
  const [hasLocationPermission, setHasLocationPermission] = useState(false);

  // Location once on open: the blue dot, and "nearby" measured from where you are.
  useEffect(() => {
    Location.requestForegroundPermissionsAsync()
      .then(async ({ granted }) => {
        setHasLocationPermission(granted);
        if (!granted) return;
        const last = await Location.getLastKnownPositionAsync();
        if (last) setUserLocation({ lat: last.coords.latitude, lng: last.coords.longitude });
      })
      .catch(() => setHasLocationPermission(false));
  }, []);

  const community = useQuery({
    queryKey: communityKeys.all,
    queryFn: fetchCommunityRoutes,
    staleTime: 60_000,
  });

  const standardRoute = useQuery({
    queryKey: ['plan-route', origin?.point, destination?.point],
    queryFn: () => planRoute(origin!.point, destination!.point),
    enabled: planning && origin !== null && destination !== null,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const fit = useCallback((points: LatLng[]) => {
    if (points.length < 2) return;
    mapRef.current?.fitToCoordinates(points.map(toMap), {
      edgePadding: { top: 200, right: 80, bottom: 380, left: 60 },
      animated: true,
    });
  }, []);

  // Zoom to the standard route when it arrives.
  useEffect(() => {
    if (standardRoute.data) fit(standardRoute.data.coordinates);
  }, [standardRoute.data, fit]);

  // 2D ↔ 3D tilt.
  useEffect(() => {
    mapRef.current?.animateCamera({ pitch: layers.threeD ? PITCH_3D : 0 }, { duration: 400 });
  }, [layers.threeD]);

  const visibleCommunity = useMemo(
    () => (community.data ?? []).filter((r) => matchesFilters(r, filters)),
    [community.data, filters],
  );

  // ---- actions -------------------------------------------------------------------------

  const zoomBy = async (zoomIn: boolean) => {
    const cam = await mapRef.current?.getCamera();
    if (!cam) return;
    if (Platform.OS === 'ios') {
      const altitude = (cam.altitude ?? 1000) * (zoomIn ? 0.5 : 2);
      mapRef.current?.animateCamera({ altitude }, { duration: 250 });
    } else {
      mapRef.current?.animateCamera(
        { zoom: (cam.zoom ?? 16) + (zoomIn ? 1 : -1) },
        { duration: 250 },
      );
    }
  };

  const goToMyLocation = async () => {
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      setHasLocationPermission(granted);
      if (!granted) return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setUserLocation(here);
      mapRef.current?.animateCamera({ center: toMap(here) }, { duration: 400 });
    } catch {
      // No fix (e.g. indoors) — keep the map where it is.
    }
  };

  /** Show the place card for `place` (replaces route planning, like tapping a pin in a map app). */
  const openPlace = (place: Place) => {
    setPlanning(false);
    setSelectedPlace(place);
    setSelectedRouteId(null);
    mapRef.current?.animateCamera({ center: toMap(place.point) }, { duration: 400 });
    sheetRef.current?.snapToIndex(SHEET_HALF);
  };

  /** Start planning a trip to `place` (from your location when known). */
  const routeTo = (place: Place) => {
    setDestination(place);
    if (!origin && userLocation) setOrigin({ label: 'My location', point: userLocation });
    setPlanning(true);
    setSelectedPlace(null);
    setSelectedRouteId(null);
    setSelectedOptionId(null);
    sheetRef.current?.snapToIndex(SHEET_HALF);
  };

  /** Start planning a trip from `place`; then ask where to. */
  const routeFrom = (place: Place) => {
    setOrigin(place);
    setDestination(null);
    setPlanning(true);
    setSelectedPlace(null);
    setSelectedOptionId(null);
    setPickerFromSearchBar(false);
    setPicking('destination');
  };

  // The focus-store subscription is created once; this ref always points at the latest actions.
  const actionsRef = useRef({ openPlace, routeTo });
  useEffect(() => {
    actionsRef.current = { openPlace, routeTo };
  });

  // Another tab (Friends → Activity) can ask us to show a route. We listen to the store, refresh
  // the community routes (the route may be brand new) and then select it.
  const communityRef = useRef(community);
  useEffect(() => {
    communityRef.current = community;
  });
  useEffect(
    () =>
      useMapFocus.subscribe((state) => {
        // A place (friend's location, landmark): show its card, or route straight to it.
        if (state.place) {
          const { place, routeToPlace } = state;
          useMapFocus.getState().clear();
          if (routeToPlace) actionsRef.current.routeTo(place);
          else actionsRef.current.openPlace(place);
          return;
        }
        const id = state.routeId;
        if (!id) return;
        useMapFocus.getState().clear();
        void communityRef.current.refetch().then(({ data }) => {
          const route = data?.find((r) => r.id === id);
          if (!route) return; // deleted meanwhile — nothing to show
          setPlanning(false);
          setSelectedPlace(null);
          setSelectedRouteId(route.id);
          fit(route.line);
        });
      }),
    [fit],
  );

  const closePlanning = () => {
    setPlanning(false);
    setOrigin(null);
    setDestination(null);
    setMode('fastest');
    setSelectedOptionId(null);
    sheetRef.current?.snapToIndex(SHEET_PEEK);
  };

  const selectOption = (id: string) => {
    setSelectedOptionId(id);
    if (id === STANDARD_OPTION_ID && standardRoute.data) fit(standardRoute.data.coordinates);
    sheetRef.current?.snapToIndex(SHEET_FULL);
  };

  const selectCommunityRoute = (route: CommunityRoute) => {
    setSelectedRouteId(route.id);
    fit(route.line);
  };

  const toggleFilter = (key: FilterKey) => {
    const next = new Set(filters);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setFilters(next);
  };

  // ---- render --------------------------------------------------------------------------

  return (
    <View style={[styles.fill, { backgroundColor: t.background }]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialCamera={DEMO_CAMERA}
        // Light, low-clutter base map (see map-style.ts for the per-platform details).
        customMapStyle={scheme === 'dark' ? DARK_MAP_STYLE : LIGHT_MAP_STYLE}
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        userInterfaceStyle={scheme}
        showsBuildings={layers.threeD}
        pitchEnabled
        showsUserLocation={hasLocationPermission}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        // Zoomed in close to a building? Show its floors.
        onRegionChangeComplete={(region) => {
          const zoomedIn = region.latitudeDelta < BUILDING_ZOOM_DELTA;
          const center = { lat: region.latitude, lng: region.longitude };
          const building = zoomedIn
            ? PRESETS.filter((p) => p.kind !== 'mtr_exit')
                .map((p) => ({ p, d: haversineMeters(center, p.point) }))
                .filter((x) => x.d <= BUILDING_FOCUS_METERS)
                .sort((a, b) => a.d - b.d)[0]?.p
            : undefined;
          setFocusedBuildingId(building?.id ?? null);
        }}
        onLongPress={(e) => {
          const { latitude, longitude } = e.nativeEvent.coordinate;
          openPlace({ label: 'Dropped pin', point: { lat: latitude, lng: longitude } });
        }}
      >
        {layers.communityRoutes
          ? visibleCommunity.map((r) => (
              <Polyline
                key={r.id}
                coordinates={r.line.map(toMap)}
                strokeColor={t.accent}
                strokeWidth={r.id === selectedRouteId ? 7 : 4}
                zIndex={r.id === selectedRouteId ? 3 : 2}
                tappable
                onPress={() => selectCommunityRoute(r)}
              />
            ))
          : null}
        {planning && standardRoute.data ? (
          <Polyline
            coordinates={standardRoute.data.coordinates.map(toMap)}
            strokeColor={t.routeStandard}
            strokeWidth={selectedOptionId === STANDARD_OPTION_ID ? 8 : 5}
            zIndex={1}
          />
        ) : null}
        {layers.places
          ? PRESETS.map((p) => (
              <Marker
                key={p.id}
                coordinate={toMap(p.point)}
                accessibilityLabel={p.en}
                tracksViewChanges={false}
                // Tapping a landmark opens its place card (no callout bubble).
                onPress={() => openPlace({ label: p.en, point: p.point, presetId: p.id })}
              >
                <View
                  style={[
                    styles.placeDot,
                    { backgroundColor: t.background, borderColor: t.textSecondary },
                  ]}
                />
              </Marker>
            ))
          : null}
        {visibleCheckpoints.map((c) => (
          <Marker
            key={`cp-${c.id}`}
            coordinate={{ latitude: c.lat, longitude: c.lng }}
            title={describeCheckpoint({
              kind: c.kind,
              floorFrom: c.floor_from,
              floorTo: c.floor_to,
              note: c.note,
            })}
            accessibilityLabel={describeCheckpoint({
              kind: c.kind,
              floorFrom: c.floor_from,
              floorTo: c.floor_to,
              note: c.note,
            })}
            zIndex={4}
          >
            <View
              style={[
                styles.checkpointDot,
                { backgroundColor: t.background, borderColor: t.primary },
              ]}
            >
              <Icon name={CHECKPOINT_INFO[c.kind].icon} size={16} color={t.primary} />
            </View>
          </Marker>
        ))}
        {(friendLocations.data ?? []).map((f) => (
          <Marker
            key={`friend-${f.user_id}`}
            coordinate={{ latitude: f.lat, longitude: f.lng }}
            accessibilityLabel={`${f.name}, friend`}
            onPress={() => openPlace(friendAsPlace(f))}
            zIndex={5}
          >
            <View
              style={[
                styles.friendMarker,
                { borderColor: t.accent, backgroundColor: t.background },
              ]}
            >
              <Avatar name={f.name} size={30} />
            </View>
          </Marker>
        ))}
        {planning && origin ? (
          <Marker
            coordinate={toMap(origin.point)}
            title={`Start: ${origin.label}`}
            pinColor={t.primary}
          />
        ) : null}
        {planning && destination ? (
          <Marker
            coordinate={toMap(destination.point)}
            title={`Destination: ${destination.label}`}
            pinColor={t.danger}
          />
        ) : null}
      </MapView>

      {/* Search bar + chips + map buttons */}
      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <View style={styles.searchRow}>
          <SearchBar
            floating
            placeholder="Search places, buildings, MTR exits…"
            onPress={() => {
              setPickerFromSearchBar(true);
              setPicking('destination');
            }}
            right={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open profile"
                onPress={() => router.navigate('/profile')}
                hitSlop={6}
              >
                <Avatar name={profile.data?.displayName ?? null} size={34} />
              </Pressable>
            }
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          keyboardShouldPersistTaps="handled"
        >
          {FILTERS.map((f) => (
            <View key={f.key} style={styles.chipShadow}>
              <Chip
                label={f.en}
                icon={f.icon as IconName}
                selected={filters.has(f.key)}
                onPress={() => toggleFilter(f.key)}
              />
            </View>
          ))}
        </ScrollView>
        {sharingOn ? (
          <View style={styles.bannerRow} pointerEvents="box-none">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="You are sharing your location. Open sharing settings"
              onPress={() => setSharingSheetOpen(true)}
              style={[styles.sharingBanner, shadow, { backgroundColor: t.primary }]}
            >
              <Icon name="access-point" size={18} color={t.onPrimary} />
              <Text style={[type.small, styles.bannerText, { color: t.onPrimary }]}>
                You’re sharing your location
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Stop sharing your location"
                onPress={() => void stopSharing()}
                hitSlop={8}
                style={styles.bannerStop}
              >
                <Text style={[type.small, { color: t.onPrimary, fontWeight: '700' }]}>Stop</Text>
              </Pressable>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.controls} pointerEvents="box-none">
          <MapControls
            layers={layers}
            onLayersChange={setLayers}
            onZoomIn={() => void zoomBy(true)}
            onZoomOut={() => void zoomBy(false)}
            onMyLocation={() => void goToMyLocation()}
          />
          {focusedBuilding ? (
            <View style={styles.floors}>
              <FloorSelector
                buildingName={focusedBuilding.en}
                floors={floors}
                selected={selectedFloor}
                loading={nearCheckpoints.isPending}
                onSelect={(floor) =>
                  setFloorByBuilding((prev) => ({ ...prev, [focusedBuilding.id]: floor }))
                }
              />
            </View>
          ) : null}
        </View>
      </SafeAreaView>

      <BottomSheet
        ref={sheetRef}
        index={SHEET_PEEK}
        snapPoints={SNAP_POINTS}
        enableDynamicSizing={false}
        backgroundStyle={{ backgroundColor: t.background, borderRadius: radius.sheet }}
        handleIndicatorStyle={{ backgroundColor: t.border, width: 40 }}
        accessibilityLabel={
          planning ? 'Route planning' : selectedPlace ? selectedPlace.label : 'Nearby routes'
        }
      >
        <BottomSheetScrollView keyboardShouldPersistTaps="handled">
          {planning ? (
            <PlanningSheet
              origin={origin}
              destination={destination}
              onPickOrigin={() => {
                setPickerFromSearchBar(false);
                setPicking('origin');
              }}
              onPickDestination={() => {
                setPickerFromSearchBar(false);
                setPicking('destination');
              }}
              onSwap={() => {
                setOrigin(destination);
                setDestination(origin);
                setSelectedOptionId(null);
              }}
              onClose={closePlanning}
              mode={mode}
              onModeChange={setMode}
              standardRoute={standardRoute.data}
              isLoading={standardRoute.isFetching}
              error={standardRoute.error}
              onRetry={() => void standardRoute.refetch()}
              selectedOptionId={selectedOptionId}
              onSelectOption={selectOption}
            />
          ) : selectedPlace ? (
            <PlaceSheet
              place={selectedPlace}
              communityRoutes={community.data ?? []}
              onRouteHere={() => routeTo(selectedPlace)}
              onRouteFrom={() => routeFrom(selectedPlace)}
              onClose={() => {
                setSelectedPlace(null);
                sheetRef.current?.snapToIndex(SHEET_PEEK);
              }}
              onSelectRoute={selectCommunityRoute}
            />
          ) : (
            <NearbySheet
              routes={community.data}
              isLoading={community.isPending}
              error={community.error}
              onRetry={() => void community.refetch()}
              center={userLocation ?? DEMO_CENTER}
              filters={filters}
              selectedId={selectedRouteId}
              onSelectRoute={selectCommunityRoute}
              onRecord={() => router.navigate('/record')}
            />
          )}
        </BottomSheetScrollView>
      </BottomSheet>

      <ShareLocationSheet visible={sharingSheetOpen} onClose={() => setSharingSheetOpen(false)} />

      <PlacePicker
        visible={picking !== null}
        title={picking === 'origin' ? 'Start from' : 'Go to'}
        allowCurrentLocation={picking === 'origin'}
        onClose={() => setPicking(null)}
        onPick={(place) => {
          const target = picking;
          setPicking(null);
          if (target === 'origin') {
            setOrigin(place);
            setSelectedOptionId(null);
            setPlanning(true);
            sheetRef.current?.snapToIndex(SHEET_HALF);
          } else if (pickerFromSearchBar) {
            openPlace(place); // search bar → place card first, like a map app
          } else {
            routeTo(place);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  searchRow: { paddingHorizontal: space.lg, paddingTop: space.sm },
  chips: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md },
  chipShadow: {
    borderRadius: radius.round,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  controls: { alignItems: 'flex-end', paddingHorizontal: space.lg, marginTop: space.sm },
  placeDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 3 },
  friendMarker: { padding: 2, borderRadius: radius.round, borderWidth: 3 },
  checkpointDot: {
    width: 30,
    height: 30,
    borderRadius: radius.round,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floors: { marginTop: space.sm, alignItems: 'flex-end' },
  bannerRow: { paddingHorizontal: space.lg },
  sharingBanner: {
    minHeight: TAP_TARGET,
    borderRadius: radius.round,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingLeft: space.md,
  },
  bannerText: { flex: 1, fontWeight: '600' },
  bannerStop: { minHeight: TAP_TARGET, justifyContent: 'center', paddingHorizontal: space.lg },
});
