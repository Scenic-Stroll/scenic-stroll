/**
 * Browser storage for recordings — the web twin of local-db.ts (which uses SQLite on phones).
 * Same functions, same rules: everything is saved here FIRST and uploaded later, and raw GPS
 * samples never leave the device. Uses IndexedDB (via idb-keyval), which survives page reloads.
 *
 * Keys: `rec:<id>` the recording · `samples:<id>` its GPS samples · `cps:<id>` its checkpoints ·
 * `cp-seq` the last checkpoint id handed out.
 */
import type { GpsSample, LocalCheckpoint } from '@scenic/shared';
import { pathLengthMeters } from '@scenic/shared';
import { createStore, del, entries, get, set, update } from 'idb-keyval';

import type {
  MyStats,
  RecordingDetail,
  RecordingStatus,
  RecordingSummary,
  ReviewFields,
} from './local-db-types';

export type { MyStats, RecordingDetail, RecordingStatus, RecordingSummary, ReviewFields };

const store = createStore('scenic-stroll', 'kv');

type StoredRecording = {
  id: string;
  status: RecordingStatus;
  startedAt: number;
  endedAt: number | null;
  distanceM: number;
  title: string | null;
  startLabel: string | null;
  endLabel: string | null;
  description: string | null;
  showAuthor: boolean;
  trimEnds: boolean;
  lastError: string | null;
  uploadedAt: number | null;
};
type StoredCheckpoint = LocalCheckpoint & { id: number };

const recKey = (id: string) => `rec:${id}`;
const samplesKey = (id: string) => `samples:${id}`;
const cpsKey = (id: string) => `cps:${id}`;

async function allRecordings(): Promise<StoredRecording[]> {
  const all = await entries<string, StoredRecording>(store);
  return all.filter(([k]) => k.startsWith('rec:')).map(([, v]) => v);
}

async function patch(id: string, change: Partial<StoredRecording>) {
  await update<StoredRecording>(recKey(id), (r) => (r ? { ...r, ...change } : r!), store);
}

// ---- writing while recording ----------------------------------------------------------------

export async function createRecording(id: string, startedAt: number, trimEnds: boolean) {
  await set(
    recKey(id),
    {
      id,
      status: 'recording',
      startedAt,
      endedAt: null,
      distanceM: 0,
      title: null,
      startLabel: null,
      endLabel: null,
      description: null,
      showAuthor: false,
      trimEnds,
      lastError: null,
      uploadedAt: null,
    } satisfies StoredRecording,
    store,
  );
}

export async function addSample(recordingId: string, s: GpsSample) {
  await update<GpsSample[]>(samplesKey(recordingId), (list) => [...(list ?? []), s], store);
}

export async function addCheckpoint(recordingId: string, cp: LocalCheckpoint): Promise<number> {
  let id = 0;
  await update<number>('cp-seq', (n) => (id = (n ?? 0) + 1), store);
  await update<StoredCheckpoint[]>(
    cpsKey(recordingId),
    (list) => [...(list ?? []), { ...cp, id }],
    store,
  );
  return id;
}

export async function deleteCheckpoint(checkpointId: number) {
  const all = await entries<string, StoredCheckpoint[]>(store);
  for (const [key, list] of all) {
    if (!key.startsWith('cps:') || !list.some((c) => c.id === checkpointId)) continue;
    await set(
      key,
      list.filter((c) => c.id !== checkpointId),
      store,
    );
  }
}

async function loadSamples(id: string): Promise<GpsSample[]> {
  const list = (await get<GpsSample[]>(samplesKey(id), store)) ?? [];
  return [...list].sort((a, b) => a.timestamp - b.timestamp);
}

/** Stop recording: compute the distance and move to 'draft'. */
export async function finishRecording(id: string) {
  const samples = await loadSamples(id);
  await patch(id, {
    status: 'draft',
    endedAt: samples.at(-1)?.timestamp ?? Date.now(),
    distanceM: pathLengthMeters(samples),
  });
}

/** On start-up: a recording still marked 'recording' means the tab was closed mid-walk. */
export async function recoverInterruptedRecordings(activeId: string | null): Promise<number> {
  const stuck = (await allRecordings()).filter(
    (r) => r.status === 'recording' && r.id !== activeId,
  );
  for (const r of stuck) await finishRecording(r.id);
  return stuck.length;
}

// ---- review / upload ----------------------------------------------------------------------

/** User pressed Save on the review screen → queue for upload. */
export async function saveReview(id: string, f: ReviewFields) {
  await update<StoredRecording>(
    recKey(id),
    (r) =>
      r
        ? {
            ...r,
            ...f,
            status: r.status === 'uploaded' ? 'uploaded' : 'pending',
            lastError: null,
          }
        : r!,
    store,
  );
}

export async function markUploaded(id: string) {
  await patch(id, { status: 'uploaded', uploadedAt: Date.now(), lastError: null });
}

export async function setLastError(id: string, message: string | null) {
  await patch(id, { lastError: message });
}

export async function deleteRecording(id: string) {
  await del(recKey(id), store);
  await del(samplesKey(id), store);
  await del(cpsKey(id), store);
}

// ---- reading -----------------------------------------------------------------------------

export async function listRecordings(): Promise<RecordingSummary[]> {
  return (await allRecordings())
    .filter((r) => r.status !== 'recording')
    .sort((a, b) => b.startedAt - a.startedAt)
    .map((r) => ({
      id: r.id,
      status: r.status,
      title: r.title,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      distanceM: r.distanceM,
      lastError: r.lastError,
    }));
}

export async function listPendingIds(): Promise<string[]> {
  return (await allRecordings())
    .filter((r) => r.status === 'pending')
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((r) => r.id);
}

export async function countPending(): Promise<number> {
  return (await listPendingIds()).length;
}

export async function loadRecording(id: string): Promise<RecordingDetail | null> {
  const r = await get<StoredRecording>(recKey(id), store);
  if (!r) return null;
  const cps = (await get<StoredCheckpoint[]>(cpsKey(id), store)) ?? [];
  return {
    id: r.id,
    status: r.status,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    lastError: r.lastError,
    title: r.title ?? '',
    startLabel: r.startLabel,
    endLabel: r.endLabel,
    description: r.description,
    showAuthor: r.showAuthor,
    trimEnds: r.trimEnds,
    samples: await loadSamples(id),
    checkpoints: [...cps].sort((a, b) => a.timestamp - b.timestamp),
  };
}

// ---- profile stats / my data ------------------------------------------------------------

/** Numbers for the Profile tab, calculated from what's stored in this browser. */
export async function getMyStats(): Promise<MyStats> {
  const recs = await allRecordings();
  const uploaded = recs.filter((r) => r.status === 'uploaded');
  let liftCheckpoints = 0;
  let shelteredRoutes = 0;
  for (const r of uploaded) {
    const cps = (await get<StoredCheckpoint[]>(cpsKey(r.id), store)) ?? [];
    liftCheckpoints += cps.filter((c) => c.kind === 'lift').length;
    if (cps.some((c) => c.kind === 'entrance')) shelteredRoutes += 1;
  }
  return {
    routesLogged: uploaded.length,
    descriptions: uploaded.filter((r) => (r.description ?? '').trim() !== '').length,
    metersWalked: recs
      .filter((r) => r.status === 'pending' || r.status === 'uploaded')
      .reduce((sum, r) => sum + r.distanceM, 0),
    liftCheckpoints,
    shelteredRoutes,
  };
}

/** Everything stored in this browser, for "Download my data". */
export async function exportLocalData() {
  const recordings = (await allRecordings()).sort((a, b) => a.startedAt - b.startedAt);
  const checkpoints = [];
  const samples = [];
  for (const r of recordings) {
    checkpoints.push(
      ...((await get<StoredCheckpoint[]>(cpsKey(r.id), store)) ?? []).map((c) => ({
        recording_id: r.id,
        ...c,
      })),
    );
    samples.push(...(await loadSamples(r.id)).map((s) => ({ recording_id: r.id, ...s })));
  }
  return { recordings, checkpoints, samples };
}

/** Ids of routes this browser uploaded (= route ids on the server). */
export async function listUploadedIds(): Promise<string[]> {
  return (await allRecordings()).filter((r) => r.status === 'uploaded').map((r) => r.id);
}

/** "Delete my data": wipes every recording, GPS sample and checkpoint in this browser. */
export async function deleteAllLocalData() {
  const all = await entries<string, unknown>(store);
  for (const [key] of all) await del(key, store);
}
