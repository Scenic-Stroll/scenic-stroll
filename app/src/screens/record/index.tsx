/**
 * Record tab.
 *   Not recording → explanation + big Start button (+ "N waiting to upload").
 *   Recording     → live map, time / distance / GPS quality, checkpoint buttons, Stop.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  DEMO_CENTER,
  formatDistance,
  GPS_RULES,
  pathLengthMeters,
  type CheckpointKind,
} from '@scenic/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import MapView from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CheckpointSheet, type CheckpointDetails } from '@/components/checkpoint-sheet';
import { RouteTrace } from '@/components/route-trace';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CHECKPOINT_INFO, CHECKPOINT_ORDER, describeCheckpoint } from '@/constants/checkpoints';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { countPending } from '@/lib/local-db';
import { localKeys } from '@/lib/query-client';
import {
  addCheckpoint,
  cancelRecording,
  removeCheckpoint,
  startRecording,
  stopRecording,
  useRecorder,
} from '@/lib/recorder';
import { useSettings } from '@/lib/settings-store';

const RED = '#C62828';
const BLUE = '#1565C0';

export function RecordHome() {
  const status = useRecorder((s) => s.status);
  return status === 'idle' ? <IdleView /> : <RecordingView />;
}

// ---------------------------------------------------------------------------------------------

function IdleView() {
  const error = useRecorder((s) => s.error);
  const dataCollection = useSettings((s) => s.dataCollectionMode);
  const pending = useQuery({ queryKey: localKeys.pendingCount, queryFn: countPending });

  const start = async () => {
    // Privacy trim is on by default; the team's data collection walks start at public places.
    await startRecording({ trimEnds: !dataCollection });
  };

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.idle}>
        <ThemedText type="subtitle">Record a route</ThemedText>
        <ThemedText themeColor="textSecondary">
          Walk your route with the app open. Tap a checkpoint button whenever you take a lift,
          escalator or stairs, go through an entrance, or cross a footbridge — GPS doesn’t work well
          indoors, so checkpoints are how others will know which way to go.
        </ThemedText>
        {dataCollection ? (
          <View style={[styles.badge, { backgroundColor: '#FFF3E0' }]}>
            <ThemedText type="smallBold" style={{ color: '#E65100' }}>
              Data collection mode is on
            </ThemedText>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start recording"
          onPress={start}
          style={[styles.startButton, dataCollection && styles.startButtonBig]}
        >
          <MaterialCommunityIcons name="record-rec" size={dataCollection ? 48 : 36} color="#fff" />
          <ThemedText style={styles.startText}>Start recording</ThemedText>
        </Pressable>

        {error ? (
          <View style={styles.errorBox}>
            <ThemedText>{error}</ThemedText>
            {/permission/i.test(error) ? (
              <Pressable accessibilityRole="button" onPress={() => Linking.openSettings()}>
                <ThemedText type="linkPrimary">Open phone settings</ThemedText>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {pending.data ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.navigate('/routes')}
            style={styles.pendingBanner}
          >
            <MaterialCommunityIcons name="cloud-upload" size={20} color={BLUE} />
            <ThemedText type="small">
              {pending.data} route{pending.data === 1 ? '' : 's'} waiting to upload — see My routes
            </ThemedText>
          </Pressable>
        ) : null}
      </SafeAreaView>
    </ThemedView>
  );
}

// ---------------------------------------------------------------------------------------------

function RecordingView() {
  const mapRef = useRef<MapView>(null);
  const points = useRecorder((s) => s.points);
  const checkpoints = useRecorder((s) => s.checkpoints);
  const startedAt = useRecorder((s) => s.startedAt);
  const lastFix = useRecorder((s) => s.lastFix);
  const recorderError = useRecorder((s) => s.error);
  const big = useSettings((s) => s.dataCollectionMode);

  const [now, setNow] = useState(() => Date.now());
  const [follow, setFollow] = useState(true);
  const [sheetKind, setSheetKind] = useState<CheckpointKind | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Tick once a second for the timer and the "no GPS for N s" warning.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Keep the newest point in view unless the user has moved the map themselves.
  const latest = points.at(-1);
  useEffect(() => {
    if (!follow || !latest) return;
    mapRef.current?.animateCamera(
      { center: { latitude: latest.lat, longitude: latest.lng } },
      { duration: 500 },
    );
  }, [follow, latest]);

  const add = async (kind: CheckpointKind, details?: CheckpointDetails) => {
    const error = await addCheckpoint(kind, details);
    setMessage(error ?? `${CHECKPOINT_INFO[kind].en} added`);
  };

  const onCheckpointButton = (kind: CheckpointKind) => {
    const info = CHECKPOINT_INFO[kind];
    if (info.asksFloors || info.asksNote) setSheetKind(kind);
    else void add(kind);
  };

  const stop = () => {
    Alert.alert('Stop recording?', 'You can review and describe the route next.', [
      { text: 'Keep walking', style: 'cancel' },
      {
        text: 'Stop',
        onPress: async () => {
          const id = await stopRecording();
          if (id) router.push({ pathname: '/recording/[id]', params: { id } });
        },
      },
    ]);
  };

  const discard = () => {
    Alert.alert('Discard this recording?', 'The route will be deleted from your phone.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => void cancelRecording() },
    ]);
  };

  const seconds = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const gps = gpsStatus(now, lastFix, latest?.timestamp ?? null);

  return (
    <View style={styles.fill}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialCamera={{
          center: {
            latitude: latest?.lat ?? lastFix?.lat ?? DEMO_CENTER.lat,
            longitude: latest?.lng ?? lastFix?.lng ?? DEMO_CENTER.lng,
          },
          pitch: 0,
          heading: 0,
          altitude: 500,
          zoom: 18,
        }}
        showsUserLocation
        showsBuildings
        onPanDrag={() => setFollow(false)}
      >
        <RouteTrace
          points={points}
          checkpoints={checkpoints}
          onCheckpointPress={(id) => {
            const cp = checkpoints.find((c) => c.id === id);
            if (!cp) return;
            Alert.alert(describeCheckpoint(cp), 'Remove this checkpoint?', [
              { text: 'Keep', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: () => void removeCheckpoint(id) },
            ]);
          }}
        />
      </MapView>

      <SafeAreaView edges={['top']} style={styles.topOverlay} pointerEvents="box-none">
        <ThemedView style={[styles.statsCard, styles.shadow]}>
          <View style={styles.statsRow}>
            <Stat label="Time" value={formatClock(seconds)} />
            <Stat label="Distance" value={formatDistance(pathLengthMeters(points))} />
            <Stat label="Checkpoints" value={String(checkpoints.length)} />
          </View>
          <View style={[styles.gpsRow, { backgroundColor: gps.color }]}>
            <MaterialCommunityIcons name="crosshairs-gps" size={16} color="#fff" />
            <ThemedText type="small" style={styles.gpsText} accessibilityLiveRegion="polite">
              {gps.text}
            </ThemedText>
          </View>
          {recorderError ? <ThemedText type="small">{recorderError}</ThemedText> : null}
        </ThemedView>
        {!follow ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setFollow(true)}
            style={[styles.followButton, styles.shadow]}
          >
            <ThemedText type="smallBold" style={{ color: BLUE }}>
              Follow me
            </ThemedText>
          </Pressable>
        ) : null}
      </SafeAreaView>

      <ThemedView style={[styles.bottomPanel, styles.shadow]}>
        {message ? (
          <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
            {message}
          </ThemedText>
        ) : null}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cpRow}
        >
          {CHECKPOINT_ORDER.map((kind) => (
            <Pressable
              key={kind}
              accessibilityRole="button"
              accessibilityLabel={`Add ${CHECKPOINT_INFO[kind].en} checkpoint`}
              onPress={() => onCheckpointButton(kind)}
              style={({ pressed }) => [
                styles.cpButton,
                big && styles.cpButtonBig,
                pressed && { opacity: 0.6 },
              ]}
            >
              <MaterialCommunityIcons
                name={CHECKPOINT_INFO[kind].icon}
                size={big ? 32 : 26}
                color={BLUE}
              />
              <ThemedText type="small">{CHECKPOINT_INFO[kind].en}</ThemedText>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.controls}>
          <Pressable accessibilityRole="button" onPress={discard} style={styles.discard}>
            <ThemedText themeColor="textSecondary">Discard</ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Stop recording"
            onPress={stop}
            style={[styles.stopButton, big && styles.stopButtonBig]}
          >
            <MaterialCommunityIcons name="stop" size={big ? 32 : 24} color="#fff" />
            <ThemedText style={styles.startText}>Stop</ThemedText>
          </Pressable>
        </View>
      </ThemedView>

      <CheckpointSheet
        kind={sheetKind}
        onCancel={() => setSheetKind(null)}
        onAdd={(details) => {
          const kind = sheetKind;
          setSheetKind(null);
          if (kind) void add(kind, details);
        }}
      />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={styles.statValue}>
        {value}
      </ThemedText>
    </View>
  );
}

function formatClock(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** One line telling the walker how GPS is doing, and what to do about it. */
function gpsStatus(
  now: number,
  lastFix: { accuracy: number | null; timestamp: number } | null,
  lastAcceptedAt: number | null,
): { text: string; color: string } {
  if (!lastFix) return { text: 'Waiting for GPS…', color: '#757575' };
  const quietFor = lastAcceptedAt ? Math.round((now - lastAcceptedAt) / 1000) : null;
  if (quietFor !== null && quietFor > GPS_RULES.gapSeconds) {
    return {
      text: `No good GPS for ${quietFor} s — add a checkpoint for lifts, stairs or entrances`,
      color: '#E65100',
    };
  }
  if (lastFix.accuracy !== null && lastFix.accuracy > GPS_RULES.maxAccuracyM) {
    return {
      text: `Weak GPS (±${Math.round(lastFix.accuracy)} m) — points are skipped`,
      color: '#E65100',
    };
  }
  const acc = lastFix.accuracy === null ? '' : ` (±${Math.round(lastFix.accuracy)} m)`;
  return { text: `GPS good${acc}`, color: '#2E7D32' };
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  idle: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.three,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 12,
  },
  startButton: {
    marginTop: Spacing.four,
    minHeight: 72,
    borderRadius: 36,
    backgroundColor: RED,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  startButtonBig: { minHeight: 112, borderRadius: 56 },
  startText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  errorBox: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(198,40,40,0.1)',
  },
  pendingBanner: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(21,101,192,0.1)',
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  statsCard: {
    marginTop: Spacing.two,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 18, lineHeight: 24 },
  gpsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
  },
  gpsText: { color: '#fff', flex: 1 },
  followButton: {
    alignSelf: 'flex-end',
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: 22,
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  bottomPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    paddingHorizontal: Spacing.three,
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    gap: Spacing.two,
  },
  cpRow: { gap: Spacing.two },
  cpButton: {
    width: 84,
    minHeight: 68,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: 'rgba(21,101,192,0.1)',
  },
  cpButtonBig: { width: 104, minHeight: 92 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  discard: { minHeight: 48, justifyContent: 'center', paddingHorizontal: Spacing.two },
  stopButton: {
    minHeight: 56,
    paddingHorizontal: Spacing.five,
    borderRadius: 28,
    backgroundColor: RED,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  stopButtonBig: { minHeight: 76, borderRadius: 38 },
  shadow: {
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});
