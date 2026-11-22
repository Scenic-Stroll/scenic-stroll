/**
 * Requests and answers of the pin Edge Functions (D53):
 *   pin-tools             snap a point to a place; look up a source by DOI or title
 *   generate-pin-versions write child / teen / adult versions with 1–2 questions each (AI)
 */
import { z } from 'zod';

import { LatLngSchema } from './schemas.ts';
import { PinQuestionSchema, PinSourceSchema, ReadingLevelSchema } from './pins.ts';

// ---- pin-tools -------------------------------------------------------------------------------

export const PinToolsRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('snap'), point: LatLngSchema }),
  z.object({ action: z.literal('lookup_source'), query: z.string().trim().min(3).max(300) }),
]);
export type PinToolsRequest = z.infer<typeof PinToolsRequestSchema>;

/** Places within 25 m of the tapped point; the expert picks one or "custom place". */
export const SnapResponseSchema = z.object({
  ped_node: z
    .object({
      build_id: z.number(),
      node_id: z.number(),
      kind: z.string(),
      level: z.string().nullable(),
      lat: z.number(),
      lng: z.number(),
      distance_m: z.number(),
    })
    .nullable(),
  osm: z
    .object({
      osm_id: z.string(),
      name: z.string(),
      lat: z.number(),
      lng: z.number(),
      distance_m: z.number(),
    })
    .nullable(),
});
export type SnapResponse = z.infer<typeof SnapResponseSchema>;

export const LookupSourceResponseSchema = z.object({ source: PinSourceSchema.nullable() });

/** How far a pin snaps to a pedestrian node or OSM place. */
export const SNAP_RADIUS_M = 25;

// ---- generate-pin-versions -------------------------------------------------------------------

export const GenerateVersionsRequestSchema = z.object({ pin_id: z.uuid() });

/** The child version is asked to stay under ~80 words; more than this is rejected. */
export const CHILD_TARGET_WORDS = 80;
export const CHILD_MAX_WORDS = 100;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const GeneratedVersionSchema = z.object({
  reading_level: ReadingLevelSchema,
  body: z.string().trim().min(10).max(4000),
  questions: z.array(PinQuestionSchema).min(1).max(2),
});

/** What the model must return: exactly one version per reading level. */
export const GeneratedVersionsSchema = z
  .object({ versions: z.array(GeneratedVersionSchema).length(3) })
  .refine(
    (g) => new Set(g.versions.map((v) => v.reading_level)).size === 3,
    'One version for each of child, teen and adult',
  )
  .refine(
    (g) =>
      g.versions.every((v) => v.reading_level !== 'child' || wordCount(v.body) <= CHILD_MAX_WORDS),
    `The child version must be at most ${CHILD_MAX_WORDS} words`,
  );
export type GeneratedVersions = z.infer<typeof GeneratedVersionsSchema>;

export const GenerateVersionsResponseSchema = z.object({
  saved: z.number(),
  model: z.string(),
});
