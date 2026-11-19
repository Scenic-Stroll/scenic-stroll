// Types shared by the phone storage (local-db.ts, SQLite) and the web storage (local-db.web.ts,
// IndexedDB), so both keep exactly the same interface.
import type { LocalCheckpoint, LocalRecording } from '@scenic/shared';

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

export type ReviewFields = {
  title: string;
  startLabel: string | null;
  endLabel: string | null;
  description: string | null;
  showAuthor: boolean;
  trimEnds: boolean;
};

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
