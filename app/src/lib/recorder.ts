/**
 * Route recorder: listens to GPS while the user walks and saves every good sample to the phone.
 *
 * It lives outside any screen (a module + zustand store), so switching tabs doesn't stop a
 * recording. GPS only works while the app is open (foreground), so the screen is kept awake.
 */
import {
  acceptSample,
  GPS_RULES,
  type CheckpointKind,
  type GpsSample,
  type LocalCheckpoint,
} from '@scenic/shared';
import { randomUUID } from 'expo-crypto';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { create } from 'zustand';

import * as localDb from '@/lib/local-db';
import { refreshLocalData } from '@/lib/query-client';

const KEEP_AWAKE_TAG = 'route-recording';
/** Ask the phone for a fix this often (the build prompt says every 2–3 s). */
const SAMPLE_EVERY_MS = 2500;
/** A checkpoint uses the latest fix if it's this fresh, otherwise the last accepted point. */
const FRESH_FIX_MS = 15_000;

export type RecorderCheckpoint = LocalCheckpoint & { id: number };

type RecorderState = {
  status: 'idle' | 'starting' | 'recording';
  recordingId: string | null;
  startedAt: number | null;
  /** Accepted samples, in order — what gets drawn and saved. */
  points: GpsSample[];
  checkpoints: RecorderCheckpoint[];
  /** The most recent fix from the phone, even if rejected (shows GPS quality). */
  lastFix: GpsSample | null;
  rejectedCount: number;
  error: string | null;
};

const initialState: RecorderState = {
  status: 'idle',
  recordingId: null,
  startedAt: null,
  points: [],
  checkpoints: [],
  lastFix: null,
  rejectedCount: 0,
  error: null,
};

export const useRecorder = create<RecorderState>(() => initialState);

let subscription: Location.LocationSubscription | null = null;
// Sample writes are chained so they hit the database in order, and Stop can wait for them.
let writes: Promise<unknown> = Promise.resolve();

function onLocation(loc: Location.LocationObject) {
  const { recordingId, points } = useRecorder.getState();
  if (!recordingId) return;

  const sample: GpsSample = {
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    accuracy: loc.coords.accuracy ?? null,
    timestamp: loc.timestamp,
  };
  const verdict = acceptSample(points.at(-1) ?? null, sample);
  if (!verdict.ok) {
    useRecorder.setState((s) => ({ lastFix: sample, rejectedCount: s.rejectedCount + 1 }));
    return;
  }
  useRecorder.setState((s) => ({ lastFix: sample, points: [...s.points, sample] }));
  writes = writes
    .then(() => localDb.addSample(recordingId, sample))
    .catch((err) => {
      // Extremely unlikely (disk full). Keep recording; show the problem.
      useRecorder.setState({ error: `Could not save a GPS point: ${String(err)}` });
    });
}

/** Starts a new recording. Returns false (and sets `error`) if location isn't allowed. */
export async function startRecording(options: { trimEnds: boolean }): Promise<boolean> {
  if (useRecorder.getState().status !== 'idle') return false;
  useRecorder.setState({ ...initialState, status: 'starting' });

  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    useRecorder.setState({
      ...initialState,
      error: 'Location permission is needed to record a route. Turn it on in your phone settings.',
    });
    return false;
  }

  const id = randomUUID();
  const startedAt = Date.now();
  await localDb.createRecording(id, startedAt, options.trimEnds);
  await activateKeepAwakeAsync(KEEP_AWAKE_TAG);
  useRecorder.setState({ status: 'recording', recordingId: id, startedAt });

  try {
    subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: SAMPLE_EVERY_MS,
        distanceInterval: 0, // also report while standing still (waiting at a crossing)
        mayShowUserSettingsDialog: true,
      },
      onLocation,
    );
  } catch (err) {
    useRecorder.setState({ error: `GPS could not start: ${String(err)}` });
  }
  return true;
}

/**
 * Drops a checkpoint at the current position. Returns the error message, or null on success.
 */
export async function addCheckpoint(
  kind: CheckpointKind,
  extra: { floorFrom?: string | null; floorTo?: string | null; note?: string | null } = {},
): Promise<string | null> {
  const { recordingId, lastFix, points } = useRecorder.getState();
  if (!recordingId) return 'Not recording.';

  // Prefer a fresh fix (even a slightly inaccurate one — indoors that's all we get), otherwise
  // the last good point. Accuracy up to 2× the normal limit is OK for "roughly here".
  const now = Date.now();
  const freshFix =
    lastFix &&
    now - lastFix.timestamp < FRESH_FIX_MS &&
    (lastFix.accuracy === null || lastFix.accuracy <= GPS_RULES.maxAccuracyM * 2)
      ? lastFix
      : null;
  const where = freshFix ?? points.at(-1);
  if (!where) return 'Waiting for GPS — step outside for a moment, then try again.';

  const checkpoint: LocalCheckpoint = {
    kind,
    lat: where.lat,
    lng: where.lng,
    floorFrom: extra.floorFrom ?? null,
    floorTo: extra.floorTo ?? null,
    note: extra.note ?? null,
    // Time of the tap, so it sorts correctly along the route.
    timestamp: now,
  };
  const id = await localDb.addCheckpoint(recordingId, checkpoint);
  useRecorder.setState((s) => ({ checkpoints: [...s.checkpoints, { ...checkpoint, id }] }));
  return null;
}

export async function removeCheckpoint(id: number) {
  await localDb.deleteCheckpoint(id);
  useRecorder.setState((s) => ({ checkpoints: s.checkpoints.filter((c) => c.id !== id) }));
}

/** Stops GPS, waits for pending writes, and returns the recording id to review. */
export async function stopRecording(): Promise<string | null> {
  const { recordingId } = useRecorder.getState();
  subscription?.remove();
  subscription = null;
  await writes;
  await deactivateKeepAwake(KEEP_AWAKE_TAG);
  if (recordingId) await localDb.finishRecording(recordingId);
  useRecorder.setState(initialState);
  await refreshLocalData();
  return recordingId;
}

/** Throw away the recording in progress. */
export async function cancelRecording() {
  const id = await stopRecording();
  if (id) await localDb.deleteRecording(id);
  await refreshLocalData();
}
