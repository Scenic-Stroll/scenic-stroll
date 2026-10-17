/**
 * Real-time arrivals (multimodal step 3): one shape for MTR Next Train, KMB/LWB, Citybus and green
 * minibus, so the stop card and plan-trip don't care which operator a stop belongs to.
 * The `eta` Edge Function returns `StopEtaResponse`; the parsers live in eta-parse.ts.
 */
import { z } from 'zod';

export const TRANSIT_OPERATORS = ['mtr', 'kmb', 'ctb', 'gmb'] as const;
export type TransitOperator = (typeof TRANSIT_OPERATORS)[number];

/** A stop or station near CityU (generated list in demo-stops.ts). */
export type TransitStop = {
  /** `<operator>:<code>`, e.g. "kmb:6652A2FE695AD8C2" or "mtr:KOT". */
  id: string;
  operator: TransitOperator;
  /** The operator's own stop id (MTR: station code). */
  code: string;
  name_en: string;
  name_zh: string;
  lat: number;
  lng: number;
  /** Route numbers (MTR: line codes) calling here. */
  routes: string[];
};

/** A green minibus route as the stop card needs it: number + destination per direction. */
export type GmbRoute = { code: string; dest: Record<string, { en: string; zh: string }> };

export const StopArrivalSchema = z.object({
  /** Bus/minibus route number, or MTR line code ("KTL"). */
  route: z.string(),
  dest_en: z.string(),
  dest_zh: z.string(),
  /** MTR only: the terminus station code, used to keep only trains going our way. */
  dest_code: z.string().nullable(),
  /** When it arrives (ISO, with +08:00). */
  at: z.string(),
  /** Platform (MTR) or null. */
  platform: z.string().nullable(),
  /** False when the operator says this time is from the timetable, not a vehicle's position. */
  realtime: z.boolean(),
  /** Operator's note ("Scheduled", "Last bus", …) or null. */
  remark: z.string().nullable(),
});
export type StopArrival = z.infer<typeof StopArrivalSchema>;

export const StopEtaRequestSchema = z.object({
  stop_id: z.string().regex(/^(mtr|kmb|ctb|gmb):[A-Za-z0-9]+$/, 'Unknown stop id'),
});

export const StopEtaResponseSchema = z.object({
  stop_id: z.string(),
  /** 'live' = the operator answered (even with no arrivals); 'unavailable' = it didn't. */
  status: z.enum(['live', 'unavailable']),
  arrivals: z.array(StopArrivalSchema),
  /** When the operator's data was read (ISO). */
  fetched_at: z.string(),
});
export type StopEtaResponse = z.infer<typeof StopEtaResponseSchema>;
