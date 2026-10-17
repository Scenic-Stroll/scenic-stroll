/**
 * One shape for every way to travel (multimodal step 1): walk, car — and later transit and taxi.
 * The `plan-trip` Edge Function returns these; the app's comparison cards, mode tabs and map read
 * them. Walking stays the core: the other modes are here to compare with it and nudge towards it.
 */
import { z } from 'zod';

import { HkLatLngSchema, RouteStepSchema } from './api.ts';
import { ConditionModeSchema } from './conditions.ts';
import { LatLngSchema } from './schemas.ts';

export const TRIP_MODES = ['walk', 'transit', 'car', 'taxi', 'mixed'] as const;
export type TripMode = (typeof TRIP_MODES)[number];

/** Modes plan-trip can be asked for (transit and taxi come in later steps). */
export const PLANNABLE_MODES = ['walk', 'car'] as const;

export const TRIP_LABELS = [
  'fastest',
  'cheapest',
  'greenest',
  'least_walking',
  'most_sheltered',
  'step_free',
  'avoids_traffic',
] as const;
export type TripLabel = (typeof TRIP_LABELS)[number];

/** Traffic along a car leg: index ranges into the leg's geometry. Google gives three levels. */
export const TrafficSegmentSchema = z.object({
  from: z.number().int().nonnegative(),
  to: z.number().int().nonnegative(),
  level: z.enum(['free', 'slow', 'jam']),
});
export type TrafficSegment = z.infer<typeof TrafficSegmentSchema>;

export const TripLegSchema = z.object({
  mode: z.enum(['walk', 'transit', 'car', 'taxi']),
  /** e.g. "MTR", "KMB" (transit, later). */
  operator: z.string().nullable(),
  /** e.g. "Kwun Tong line", "2C" (transit, later). */
  route_name: z.string().nullable(),
  depart_at: z.string(),
  arrive_at: z.string(),
  /** true = times from a live feed (traffic now, real-time ETA). */
  realtime: z.boolean(),
  distance_m: z.number().nonnegative(),
  geometry: z.array(LatLngSchema).min(2),
  traffic_segments: z.array(TrafficSegmentSchema).optional(),
  instructions: z.array(RouteStepSchema),
});
export type TripLeg = z.infer<typeof TripLegSchema>;

export const TripOptionSchema = z.object({
  id: z.string(),
  mode: z.enum(TRIP_MODES),
  /** "Walk · Sheltered", "Car via Waterloo Road". */
  title: z.string(),
  total_s: z.number().nonnegative(),
  depart_at: z.string(),
  arrive_at: z.string(),
  distance_m: z.number().nonnegative(),
  /** null = fare/cost unknown ("cost unavailable"); walking is 0. */
  cost_hkd: z.number().nonnegative().nullable(),
  /** Estimated tailpipe CO₂ for the trip, grams (emissions.ts). */
  co2_g: z.number().nonnegative(),
  walking_s: z.number().nonnegative(),
  waiting_s: z.number().nonnegative(),
  transfers: z.number().int().nonnegative(),
  step_free: z.enum(['yes', 'unconfirmed', 'no']),
  /** Share of the walking in the sun now (computed walks only); null = unknown. */
  sun_exposed_pct: z.number().min(0).max(100).nullable(),
  /** Share of the walking not under cover; null = unknown. */
  uncovered_pct: z.number().min(0).max(100).nullable(),
  legs: z.array(TripLegSchema).min(1),
  labels: z.array(z.enum(TRIP_LABELS)),
  /** Green nudge: a walk/transit option within a few minutes of driving. */
  recommended: z.boolean(),
  /** "Only 3 min slower than driving · saves ~330 g CO₂". */
  nudge: z.string().nullable(),
  /** Car/taxi only. */
  traffic: z
    .object({
      /** Extra time from traffic now vs a typical day; null when traffic isn't live. */
      delay_s: z.number().nullable(),
      live: z.boolean(),
      /** "Avoids traffic: saves 6 min vs the route via Waterloo Road". */
      avoids: z.string().nullable(),
    })
    .nullable(),
  /** Which numbers are estimates, so the app can say so: 'shade', 'traffic', 'co2'… */
  estimated: z.array(z.string()),
  /** Where it came from: 'walking-graph', 'google', 'ors'. */
  source: z.string(),
});
export type TripOption = z.infer<typeof TripOptionSchema>;

export const PlanTripRequestSchema = z.object({
  origin: HkLatLngSchema,
  destination: HkLatLngSchema,
  /** When you'll leave (ISO with offset). Default: now. */
  depart_at: z.iso.datetime({ offset: true }).optional(),
  modes: z.array(z.enum(PLANNABLE_MODES)).min(1).default(['walk', 'car']),
  /** The "Now" card's condition (or demo simulation), so walking exposure matches it. */
  condition: ConditionModeSchema.optional(),
});
export type PlanTripRequest = z.input<typeof PlanTripRequestSchema>;

export const PlanTripResponseSchema = z.object({
  /** Sorted "best for you" first. */
  options: z.array(TripOptionSchema),
  /** Modes that gave nothing, and why (shown as a quiet note, never an error). */
  unavailable: z.array(z.object({ mode: z.enum(TRIP_MODES), reason: z.string() })),
  condition: ConditionModeSchema,
  data_freshness: z.object({ traffic_at: z.string().nullable() }),
});
export type PlanTripResponse = z.infer<typeof PlanTripResponseSchema>;
