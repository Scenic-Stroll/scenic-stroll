/**
 * Request/response shapes of our Edge Functions. The app and the functions both validate with these,
 * so a mismatch shows up as a clear error instead of a blank map.
 */
import { z } from 'zod';

import { LatLngSchema } from './schemas.ts';

// Hong Kong bounding box (generous). Rejecting points outside it stops typos and abuse of our API quota.
export const HK_BOUNDS = { minLat: 22.1, maxLat: 22.6, minLng: 113.8, maxLng: 114.5 } as const;

export const HkLatLngSchema = LatLngSchema.refine(
  (p) =>
    p.lat >= HK_BOUNDS.minLat &&
    p.lat <= HK_BOUNDS.maxLat &&
    p.lng >= HK_BOUNDS.minLng &&
    p.lng <= HK_BOUNDS.maxLng,
  { message: 'Point must be in Hong Kong' },
);

// ---- plan-route --------------------------------------------------------------------------
export const PlanRouteRequestSchema = z.object({
  origin: HkLatLngSchema,
  destination: HkLatLngSchema,
});
export type PlanRouteRequest = z.infer<typeof PlanRouteRequestSchema>;

/** One turn-by-turn instruction from the routing provider. */
export const RouteStepSchema = z.object({
  instruction: z.string(),
  distance_m: z.number().nonnegative(),
  duration_s: z.number().nonnegative(),
});
export type RouteStep = z.infer<typeof RouteStepSchema>;

export const PlanRouteResponseSchema = z.object({
  provider: z.enum(['ors', 'google']),
  distance_m: z.number().nonnegative(),
  duration_s: z.number().nonnegative(),
  /** The walking line, start → end. Never empty. */
  coordinates: z.array(LatLngSchema).min(2),
  /** Step-by-step directions. Optional so an older deployed function still validates. */
  steps: z.array(RouteStepSchema).optional(),
});
export type PlanRouteResponse = z.infer<typeof PlanRouteResponseSchema>;

// ---- geocode -----------------------------------------------------------------------------
export const GeocodeRequestSchema = z.object({
  text: z.string().trim().min(2).max(120),
});
export type GeocodeRequest = z.infer<typeof GeocodeRequestSchema>;

export const GeocodeResultSchema = z.object({
  label: z.string(),
  point: LatLngSchema,
});
export type GeocodeResult = z.infer<typeof GeocodeResultSchema>;

export const GeocodeResponseSchema = z.object({
  results: z.array(GeocodeResultSchema),
});
export type GeocodeResponse = z.infer<typeof GeocodeResponseSchema>;

/** Error body every function returns on failure. */
export const ApiErrorSchema = z.object({ error: z.string() });

// ---- function names + health check ----------------------------------------------------------

/**
 * Every Edge Function the app calls — the ONE place their names are written.
 * Each name must match a folder in supabase/functions/ and a [functions.<name>] block in
 * supabase/config.toml. `npm run check:functions` verifies that, and that each is deployed.
 */
export const FUNCTIONS = {
  planRoute: 'plan-route',
  geocode: 'geocode',
} as const;
export type FunctionName = (typeof FUNCTIONS)[keyof typeof FUNCTIONS];

/**
 * What a function returns for GET (the Settings → "Test backend" button).
 * `missingSecrets` lists secret NAMES that aren't set — never their values.
 */
export const FunctionHealthSchema = z.object({
  ok: z.literal(true),
  function: z.string(),
  provider: z.string(),
  missingSecrets: z.array(z.string()),
});
export type FunctionHealth = z.infer<typeof FunctionHealthSchema>;
