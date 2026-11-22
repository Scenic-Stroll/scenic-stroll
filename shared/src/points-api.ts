/**
 * The award-points Edge Function (D55). The app sends what happened — a recorded walk's GPS fixes,
 * or "I finished reading this pin" — never a number of points; the server works the points out
 * with shared/src/pointsRules.ts.
 */
import { z } from 'zod';

import { ReadingLevelSchema } from './pins.ts';

/** Fixes of one recorded walk. Limits: inside Hong Kong, at most 14 days old, about 5 hours max. */
const WalkFixSchema = z.object({
  lat: z.number().min(22.1).max(22.6),
  lng: z.number().min(113.8).max(114.5),
  accuracy: z.number().nonnegative().nullable(),
  timestamp: z.number().int().positive(),
});

export const AwardPointsRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('walk'),
    walk_id: z.uuid(),
    samples: z.array(WalkFixSchema).min(2).max(20_000),
  }),
  z.object({ action: z.literal('pin_read'), pin_id: z.uuid(), level: ReadingLevelSchema }),
]);
export type AwardPointsRequest = z.infer<typeof AwardPointsRequestSchema>;

export const AwardPointsResponseSchema = z.object({ awarded: z.number().int().nonnegative() });

/** Fixes from the future or older than this are refused (a stale queue, or a forged walk). */
export const WALK_MAX_AGE_MS = 14 * 24 * 3600_000;
