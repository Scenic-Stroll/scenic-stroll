/**
 * Request/response of the `smart-route` Edge Function (our own computed routes).
 * Separate from api.ts because it depends on the weather code (conditions.ts → suncalc), which the
 * plan-route and geocode functions don't need to bundle.
 */
import { z } from 'zod';

import { ConditionModeSchema } from './conditions.ts';
import { HkLatLngSchema, RouteStepSchema } from './api.ts';
import { ROUTING_PROFILES } from './routing-profiles.ts';
import { LatLngSchema } from './schemas.ts';

export const RoutingProfileSchema = z.enum(ROUTING_PROFILES);

export const SmartRouteRequestSchema = z.object({
  origin: HkLatLngSchema,
  destination: HkLatLngSchema,
  /** The tab the user picked; "Best now" (from the weather) and "Fastest" are always added. */
  profile: RoutingProfileSchema.default('fastest'),
  /** When you'll leave (ISO with offset). Default: now. Indoor links closed by then are avoided. */
  departure_time: z.iso.datetime({ offset: true }).optional(),
  /** The user's "Now" card choice or demo "Simulate weather"; otherwise live HKO conditions. */
  condition: ConditionModeSchema.optional(),
});
export type SmartRouteRequest = z.input<typeof SmartRouteRequestSchema>;

export const SMART_ROUTE_ROLES = ['requested', 'best_now', 'fastest'] as const;

/** How each stretch of a route is drawn: sun = orange, shade = dark green, indoor = blue… */
export const RUN_STYLES = [
  'sun',
  'shade',
  'covered',
  'indoor',
  'open', // outdoors, but no sun to speak of (night) or shade unknown
  'stairs',
  'lift',
  'escalator',
] as const;
export type RunStyle = (typeof RUN_STYLES)[number];

export const SmartRouteOptionSchema = z.object({
  /** Stable within a response, e.g. "sheltered". */
  id: z.string(),
  profile: RoutingProfileSchema,
  /** Why it is listed. One route can be several: "requested" + "best_now". */
  roles: z.array(z.enum(SMART_ROUTE_ROLES)).min(1),
  coordinates: z.array(LatLngSchema).min(2),
  distance_m: z.number().nonnegative(),
  duration_s: z.number().nonnegative(),
  pct_covered: z.number().min(0).max(100),
  pct_indoor: z.number().min(0).max(100),
  pct_air_conditioned: z.number().min(0).max(100),
  stairs: z.number().int().nonnegative(),
  lifts: z.number().int().nonnegative(),
  escalators: z.number().int().nonnegative(),
  crossings: z.number().int().nonnegative(),
  max_slope_pct: z.number(),
  /** "yes" only when every part is known to be step-free. */
  step_free: z.enum(['yes', 'unconfirmed', 'no']),
  /** More than 1.4× the fastest route's time. */
  much_longer: z.boolean(),
  extra_s_vs_fastest: z.number(),
  segments: z.array(
    z.enum(['outdoor', 'indoor', 'lift', 'escalator', 'stairs', 'footbridge', 'underpass']),
  ),
  steps: z.array(RouteStepSchema),
  explanation: z.object({
    text: z.string(),
    facts: z.record(z.string(), z.union([z.number(), z.string(), z.null()])),
  }),
  /** % of the route in shade (incl. covered/indoor) at the time you walk it; null after dark. */
  pct_shaded: z.number().min(0).max(100).nullable(),
  /** Metres in the sun / in shade / under cover / indoors / outdoors-without-sun, for the bar. */
  exposure: z.object({
    sun_m: z.number(),
    shade_m: z.number(),
    covered_m: z.number(),
    indoor_m: z.number(),
    open_m: z.number(),
  }),
  /** Stretches of `coordinates` (inclusive index ranges) and how to draw them. */
  runs: z.array(
    z.object({ style: z.enum(RUN_STYLES), from: z.number().int(), to: z.number().int() }),
  ),
  /** Stairs, lifts and escalators along the way, for map markers. */
  markers: z.array(
    z.object({ kind: z.enum(['stairs', 'lift', 'escalator']), point: LatLngSchema }),
  ),
  data_sources: z.array(z.string()),
  /** Attributes that are estimates, so the app can say so (e.g. "air_conditioned"). */
  estimated: z.array(z.string()),
});
export type SmartRouteOption = z.infer<typeof SmartRouteOptionSchema>;

export const SmartRouteResponseSchema = z.object({
  /**
   * ok = options found; outside_area = a point is outside our walking graph; no_route = no path
   * (e.g. everything closed); no_graph = no graph loaded. Anything but "ok": use the standard route.
   */
  status: z.enum(['ok', 'outside_area', 'no_route', 'no_graph']),
  condition: ConditionModeSchema,
  /** Was the condition sent by the app (override / simulation) or read live? */
  condition_source: z.enum(['given', 'live']),
  best_profile: RoutingProfileSchema,
  /** Profiles that found no route (e.g. no step-free way exists). */
  unavailable: z.array(RoutingProfileSchema),
  graph: z
    .object({
      build_id: z.number(),
      source: z.string(),
      version: z.string(),
      /** The day shade was computed for; null = no shade data. */
      shade_date: z.string().nullable().optional(),
    })
    .nullable(),
  options: z.array(SmartRouteOptionSchema),
});
export type SmartRouteResponse = z.infer<typeof SmartRouteResponseSchema>;
