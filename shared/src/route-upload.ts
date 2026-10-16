/**
 * Turns a recording saved on the phone into the payload we upload.
 *
 * Privacy rule (build prompt §5 Phase 2): raw GPS traces NEVER leave the phone. Only the
 * filtered + optionally trimmed + simplified line is uploaded, and checkpoints inside a trimmed
 * end are dropped too (they would reveal where the walk started/ended).
 */
import { z } from 'zod';

import { pathLengthMeters } from './geo.ts';
import { filterSamples, simplify, trimEnds, type GpsSample } from './gps.ts';
import { CheckpointKindSchema, LatLngSchema, type CheckpointKind } from './schemas.ts';

/** A checkpoint as stored on the phone. */
export type LocalCheckpoint = {
  kind: CheckpointKind;
  lat: number;
  lng: number;
  floorFrom: string | null;
  floorTo: string | null;
  note: string | null;
  timestamp: number;
};

/** Everything the review screen collected, plus the raw samples. */
export type LocalRecording = {
  id: string;
  title: string;
  startLabel: string | null;
  endLabel: string | null;
  description: string | null;
  showAuthor: boolean;
  trimEnds: boolean;
  samples: GpsSample[];
  checkpoints: LocalCheckpoint[];
};

const Label = z.string().trim().min(1).max(80);
const Floor = z.string().trim().min(1).max(10);

/** What the `create_route` database function receives. Mirrored by checks in the SQL. */
export const RouteUploadSchema = z.object({
  id: z.uuid(),
  title: Label,
  start_label: Label.nullable(),
  end_label: Label.nullable(),
  show_author: z.boolean(),
  duration_s: z
    .number()
    .int()
    .min(0)
    .max(6 * 3600),
  line: z.array(LatLngSchema).min(2).max(5000),
  checkpoints: z
    .array(
      z.object({
        seq: z.number().int().min(1),
        kind: CheckpointKindSchema,
        point: LatLngSchema,
        floor_from: Floor.nullable(),
        floor_to: Floor.nullable(),
        note: z.string().trim().max(200).nullable(),
      }),
    )
    .max(100),
  description: z.string().trim().min(1).max(2000).nullable(),
  /** 'recorded' = GPS recording; 'planned' = a route the app planned that the walker completed. */
  origin: z.enum(['recorded', 'planned']).default('recorded'),
});
export type RouteUpload = z.infer<typeof RouteUploadSchema>;

export type BuildResult = { ok: true; upload: RouteUpload } | { ok: false; error: string };

/** Empty or whitespace-only text → null, so optional fields are stored as "not given". */
const blankToNull = (s: string | null) => (s && s.trim().length > 0 ? s.trim() : null);

export function buildRouteUpload(rec: LocalRecording): BuildResult {
  // 1. Same filter as during recording, as a safety net (e.g. data from an older app version).
  let points = filterSamples(rec.samples);
  if (points.length < 2) {
    return { ok: false, error: 'Not enough GPS points. Record outdoors for a little longer.' };
  }

  // 2. Privacy trim.
  if (rec.trimEnds) {
    const trimmed = trimEnds(points);
    if (!trimmed) {
      return {
        ok: false,
        error:
          'Route is too short to hide its first and last 50 m. Turn off trimming or walk further.',
      };
    }
    points = trimmed;
  }
  const first = points[0]!;
  const last = points.at(-1)!;

  // 3. Checkpoints inside the kept part only, numbered 1, 2, 3… in walking order.
  const checkpoints = rec.checkpoints
    .filter((c) => c.timestamp >= first.timestamp && c.timestamp <= last.timestamp)
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((c, i) => ({
      seq: i + 1,
      kind: c.kind,
      point: { lat: c.lat, lng: c.lng },
      floor_from: blankToNull(c.floorFrom),
      floor_to: blankToNull(c.floorTo),
      note: blankToNull(c.note),
    }));

  // 4. Simplify (~3 m) and keep only coordinates (no timestamps/accuracy leave the phone).
  const line = simplify(points).map((p) => ({ lat: p.lat, lng: p.lng }));

  const candidate = {
    id: rec.id,
    title: rec.title.trim(),
    start_label: blankToNull(rec.startLabel),
    end_label: blankToNull(rec.endLabel),
    show_author: rec.showAuthor,
    duration_s: Math.round((last.timestamp - first.timestamp) / 1000),
    line,
    checkpoints,
    description: blankToNull(rec.description),
  };

  const parsed = RouteUploadSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: `Can't upload: ${issue?.path.join('.') || 'route'} — ${issue?.message}`,
    };
  }
  return { ok: true, upload: parsed.data };
}

/** Length of the uploaded line in metres (the server recomputes this; used for display). */
export function uploadLengthMeters(upload: RouteUpload): number {
  return pathLengthMeters(upload.line);
}

/** A walked route the app planned (follow mode → "Save as a community route"). */
export type PlannedWalk = {
  id: string;
  title: string;
  startLabel: string | null;
  endLabel: string | null;
  description: string | null;
  showAuthor: boolean;
  /** The line actually walked (incl. the parts before any re-plan). */
  line: { lat: number; lng: number }[];
  durationS: number;
  /** Stairs, lifts and escalators on the way (from the computed route), as checkpoints. */
  markers: { kind: 'stairs' | 'lift' | 'escalator'; point: { lat: number; lng: number } }[];
};

/**
 * The upload for a planned walk. No privacy trim: the line is the app's planned path (not a GPS
 * trace), but it does start where you started — the save screen says so and the walker chooses.
 */
export function buildPlannedRouteUpload(walk: PlannedWalk): BuildResult {
  const parsed = RouteUploadSchema.safeParse({
    id: walk.id,
    title: walk.title.trim(),
    start_label: blankToNull(walk.startLabel),
    end_label: blankToNull(walk.endLabel),
    show_author: walk.showAuthor,
    duration_s: Math.round(walk.durationS),
    line: walk.line.map((p) => ({ lat: p.lat, lng: p.lng })),
    checkpoints: walk.markers.slice(0, 100).map((m, i) => ({
      seq: i + 1,
      kind: m.kind,
      point: m.point,
      floor_from: null,
      floor_to: null,
      note: null,
    })),
    description: blankToNull(walk.description),
    origin: 'planned',
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: `Can't save: ${issue?.path.join('.') || 'route'} — ${issue?.message}`,
    };
  }
  return { ok: true, upload: parsed.data };
}
