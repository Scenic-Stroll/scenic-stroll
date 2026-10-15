/**
 * On-phone storage for recordings (SQLite). Everything is saved here FIRST and uploaded later,
 * because GPS and signal drop in MTR stations and mall basements — no recording may be lost.
 *
 * Raw GPS samples stay on the phone. Only the simplified line is uploaded (see buildRouteUpload).
 *
 * Status of a recording:
 *   recording → still walking (if the app was killed, it becomes 'draft' on next launch)
 *   draft     → stopped, not reviewed/saved yet
 *   pending   → saved by the user, waiting to upload
 *   uploaded  → on the server
 */
import type { CheckpointKind, GpsSample, LocalCheckpoint, LocalRecording } from '@scenic/shared';
import { pathLengthMeters } from '@scenic/shared';
import * as SQLite from 'expo-sqlite';

export type RecordingStatus = 'recording' | 'draft' | 'pending' | 'uploaded';

export type RecordingSummary = {
  id: string;
  status: RecordingStatus;
  title: string | null;
  startedAt: number;
  endedAt: number | null;
  distanceM: number;
  lastError: string | null;
};

/** A recording with everything the review screen needs. */
export type RecordingDetail = Omit<LocalRecording, 'checkpoints'> & {
  status: RecordingStatus;
  startedAt: number;
  endedAt: number | null;
  lastError: string | null;
  checkpoints: (LocalCheckpoint & { id: number })[];
};

const db = SQLite.openDatabaseSync('scenic-stroll.db');

// Schema version 1. To change the schema later: add a `if (version < 2) { ... }` block.
db.execSync(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
`);
const { user_version: version } = db.getFirstSync<{ user_version: number }>('PRAGMA user_version')!;
if (version < 1) {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS recordings (
      id TEXT PRIMARY KEY NOT NULL,
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      distance_m REAL NOT NULL DEFAULT 0,
      title TEXT,
      start_label TEXT,
      end_label TEXT,
      description TEXT,
      show_author INTEGER NOT NULL DEFAULT 0,
      trim_ends INTEGER NOT NULL DEFAULT 1,
      last_error TEXT,
      uploaded_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS samples (
      recording_id TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      accuracy REAL,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS samples_recording_ts ON samples(recording_id, ts);
    CREATE TABLE IF NOT EXISTS checkpoints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recording_id TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      floor_from TEXT,
      floor_to TEXT,
      note TEXT,
      ts INTEGER NOT NULL
    );
    PRAGMA user_version = 1;
  `);
}

// ---- writing while recording ----------------------------------------------------------------

export async function createRecording(id: string, startedAt: number, trimEnds: boolean) {
  await db.runAsync(
    `INSERT INTO recordings (id, status, started_at, trim_ends) VALUES (?, 'recording', ?, ?)`,
    id,
    startedAt,
    trimEnds ? 1 : 0,
  );
}

export async function addSample(recordingId: string, s: GpsSample) {
  await db.runAsync(
    'INSERT INTO samples (recording_id, lat, lng, accuracy, ts) VALUES (?, ?, ?, ?, ?)',
    recordingId,
    s.lat,
    s.lng,
    s.accuracy,
    s.timestamp,
  );
}

export async function addCheckpoint(recordingId: string, cp: LocalCheckpoint): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO checkpoints (recording_id, kind, lat, lng, floor_from, floor_to, note, ts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    recordingId,
    cp.kind,
    cp.lat,
    cp.lng,
    cp.floorFrom,
    cp.floorTo,
    cp.note,
    cp.timestamp,
  );
  return result.lastInsertRowId;
}

export async function deleteCheckpoint(checkpointId: number) {
  await db.runAsync('DELETE FROM checkpoints WHERE id = ?', checkpointId);
}

/** Stop recording: compute the distance and move to 'draft'. */
export async function finishRecording(id: string) {
  const samples = await loadSamples(id);
  const endedAt = samples.at(-1)?.timestamp ?? Date.now();
  await db.runAsync(
    `UPDATE recordings SET status = 'draft', ended_at = ?, distance_m = ? WHERE id = ?`,
    endedAt,
    pathLengthMeters(samples),
    id,
  );
}

/**
 * On app start: a recording still marked 'recording' means the app was closed mid-walk.
 * `activeId` (the recording in progress right now, if any) is skipped — this matters during
 * development, where a hot reload can re-run start-up code while still recording.
 */
export async function recoverInterruptedRecordings(activeId: string | null): Promise<number> {
  const rows = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM recordings WHERE status = 'recording' AND id IS NOT ?`,
    activeId,
  );
  for (const row of rows) await finishRecording(row.id);
  return rows.length;
}

// ---- review / upload ----------------------------------------------------------------------

export type ReviewFields = {
  title: string;
  startLabel: string | null;
  endLabel: string | null;
  description: string | null;
  showAuthor: boolean;
  trimEnds: boolean;
};

/** User pressed Save on the review screen → queue for upload. */
export async function saveReview(id: string, f: ReviewFields) {
  await db.runAsync(
    `UPDATE recordings
     SET title = ?, start_label = ?, end_label = ?, description = ?, show_author = ?, trim_ends = ?,
         status = CASE WHEN status = 'uploaded' THEN 'uploaded' ELSE 'pending' END,
         last_error = NULL
     WHERE id = ?`,
    f.title,
    f.startLabel,
    f.endLabel,
    f.description,
    f.showAuthor ? 1 : 0,
    f.trimEnds ? 1 : 0,
    id,
  );
}

export async function markUploaded(id: string) {
  await db.runAsync(
    `UPDATE recordings SET status = 'uploaded', uploaded_at = ?, last_error = NULL WHERE id = ?`,
    Date.now(),
    id,
  );
}

export async function setLastError(id: string, message: string | null) {
  await db.runAsync('UPDATE recordings SET last_error = ? WHERE id = ?', message, id);
}

export async function deleteRecording(id: string) {
  await db.runAsync('DELETE FROM recordings WHERE id = ?', id);
}

// ---- reading -----------------------------------------------------------------------------

type RecordingRow = {
  id: string;
  status: RecordingStatus;
  started_at: number;
  ended_at: number | null;
  distance_m: number;
  title: string | null;
  start_label: string | null;
  end_label: string | null;
  description: string | null;
  show_author: number;
  trim_ends: number;
  last_error: string | null;
};

export async function listRecordings(): Promise<RecordingSummary[]> {
  const rows = await db.getAllAsync<RecordingRow>(
    `SELECT * FROM recordings WHERE status != 'recording' ORDER BY started_at DESC`,
  );
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    title: r.title,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    distanceM: r.distance_m,
    lastError: r.last_error,
  }));
}

export async function listPendingIds(): Promise<string[]> {
  const rows = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM recordings WHERE status = 'pending' ORDER BY started_at`,
  );
  return rows.map((r) => r.id);
}

export async function countPending(): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM recordings WHERE status = 'pending'`,
  );
  return row?.n ?? 0;
}

async function loadSamples(id: string): Promise<GpsSample[]> {
  const rows = await db.getAllAsync<{
    lat: number;
    lng: number;
    accuracy: number | null;
    ts: number;
  }>('SELECT lat, lng, accuracy, ts FROM samples WHERE recording_id = ? ORDER BY ts', id);
  return rows.map((r) => ({ lat: r.lat, lng: r.lng, accuracy: r.accuracy, timestamp: r.ts }));
}

export async function loadRecording(id: string): Promise<RecordingDetail | null> {
  const r = await db.getFirstAsync<RecordingRow>('SELECT * FROM recordings WHERE id = ?', id);
  if (!r) return null;
  const cps = await db.getAllAsync<{
    id: number;
    kind: CheckpointKind;
    lat: number;
    lng: number;
    floor_from: string | null;
    floor_to: string | null;
    note: string | null;
    ts: number;
  }>('SELECT * FROM checkpoints WHERE recording_id = ? ORDER BY ts', id);

  return {
    id: r.id,
    status: r.status,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    lastError: r.last_error,
    title: r.title ?? '',
    startLabel: r.start_label,
    endLabel: r.end_label,
    description: r.description,
    showAuthor: r.show_author === 1,
    trimEnds: r.trim_ends === 1,
    samples: await loadSamples(id),
    checkpoints: cps.map((c) => ({
      id: c.id,
      kind: c.kind,
      lat: c.lat,
      lng: c.lng,
      floorFrom: c.floor_from,
      floorTo: c.floor_to,
      note: c.note,
      timestamp: c.ts,
    })),
  };
}

// ---- profile stats / my data ------------------------------------------------------------

export type MyStats = {
  /** Routes uploaded (shared with the community). */
  routesLogged: number;
  /** Uploaded routes that include a description. */
  descriptions: number;
  /** Total distance of saved recordings (waiting or uploaded), in metres. */
  metersWalked: number;
  /** Lift checkpoints on uploaded routes. */
  liftCheckpoints: number;
  /** Uploaded routes that go indoors (have an entrance checkpoint). */
  shelteredRoutes: number;
};

/** Numbers for the Profile tab, calculated from what's stored on this phone. */
export async function getMyStats(): Promise<MyStats> {
  const row = await db.getFirstAsync<{
    routes: number;
    descriptions: number;
    meters: number | null;
  }>(
    `SELECT
       SUM(CASE WHEN status = 'uploaded' THEN 1 ELSE 0 END) AS routes,
       SUM(CASE WHEN status = 'uploaded' AND TRIM(COALESCE(description, '')) != '' THEN 1 ELSE 0 END) AS descriptions,
       SUM(CASE WHEN status IN ('pending', 'uploaded') THEN distance_m ELSE 0 END) AS meters
     FROM recordings`,
  );
  const cps = await db.getFirstAsync<{ lifts: number; sheltered: number }>(
    `SELECT
       SUM(CASE WHEN c.kind = 'lift' THEN 1 ELSE 0 END) AS lifts,
       COUNT(DISTINCT CASE WHEN c.kind = 'entrance' THEN c.recording_id END) AS sheltered
     FROM checkpoints c JOIN recordings r ON r.id = c.recording_id
     WHERE r.status = 'uploaded'`,
  );
  return {
    routesLogged: row?.routes ?? 0,
    descriptions: row?.descriptions ?? 0,
    metersWalked: row?.meters ?? 0,
    liftCheckpoints: cps?.lifts ?? 0,
    shelteredRoutes: cps?.sheltered ?? 0,
  };
}

/** Everything stored on this phone, for "Download my data". */
export async function exportLocalData() {
  return {
    recordings: await db.getAllAsync('SELECT * FROM recordings ORDER BY started_at'),
    checkpoints: await db.getAllAsync('SELECT * FROM checkpoints ORDER BY recording_id, ts'),
    samples: await db.getAllAsync('SELECT * FROM samples ORDER BY recording_id, ts'),
  };
}

/** Ids of routes this phone uploaded (= route ids on the server). */
export async function listUploadedIds(): Promise<string[]> {
  const rows = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM recordings WHERE status = 'uploaded'`,
  );
  return rows.map((r) => r.id);
}

/** "Delete my data": wipes every recording, GPS sample and checkpoint on this phone. */
export async function deleteAllLocalData() {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM checkpoints');
    await db.runAsync('DELETE FROM samples');
    await db.runAsync('DELETE FROM recordings');
  });
}
