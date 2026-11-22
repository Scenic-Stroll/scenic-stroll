/**
 * Knowledge pins: short, expert-checked notes about places people walk past (docs/PINS.md, D51).
 * These shapes match the tables in supabase/migrations/*_knowledge_pins.sql — the database has the
 * same limits as CHECK constraints, so a value that passes here is also accepted there.
 */
import { z } from 'zod';

export const READING_LEVELS = ['child', 'teen', 'adult'] as const;
export const ReadingLevelSchema = z.enum(READING_LEVELS);
export type ReadingLevel = z.infer<typeof ReadingLevelSchema>;

export const PIN_STATUSES = ['draft', 'in_review', 'live', 'paused'] as const;
export const PinStatusSchema = z.enum(PIN_STATUSES);
export type PinStatus = z.infer<typeof PinStatusSchema>;

export const PinLabelSchema = z.enum(['expert_verified', 'ai_summarized']);
export type PinLabel = z.infer<typeof PinLabelSchema>;

export const PIN_LABEL_TEXT: Record<PinLabel, string> = {
  expert_verified: 'Expert-verified',
  ai_summarized: 'AI-summarized',
};

/** Pins are collected within this radius; the expert picks 30–50 m (default 40). */
export const PIN_RADIUS = { min: 30, max: 50, default: 40 } as const;

/** What a pin is attached to. The pin's point is always the truth (docs/PINS_AUDIT.md §5). */
export const PlaceRefSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ped_node'),
    build_id: z.number().int().positive(),
    node_id: z.number().int().nonnegative(),
  }),
  z.object({ kind: z.literal('osm'), osm_id: z.string().regex(/^(node|way|relation)\/\d+$/) }),
  z.object({ kind: z.literal('custom'), description: z.string().trim().min(5).max(200) }),
]);
export type PlaceRef = z.infer<typeof PlaceRefSchema>;

export const SourceDbSchema = z.enum(['openalex', 'crossref', 'semantic_scholar', 'web']);
export type SourceDb = z.infer<typeof SourceDbSchema>;

export const PinSourceSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(2).max(300),
  url: z.string().regex(/^https?:\/\//),
  doi: z
    .string()
    .regex(/^10\.\d{4,9}\/\S+$/)
    .nullable(),
  source_db: SourceDbSchema,
  is_open_access: z.boolean(),
});
export type PinSource = z.infer<typeof PinSourceSchema>;

/** A multiple-choice "Guess, then see the answer" question. `answer` is one of `options`. */
export const PinQuestionSchema = z
  .object({
    prompt: z.string().trim().min(5).max(300),
    options: z.array(z.string().trim().min(1).max(120)).min(2).max(5),
    answer: z.string(),
    explanation: z.string().trim().min(5).max(600),
  })
  .refine((q) => q.options.includes(q.answer), {
    message: 'The answer must be one of the options',
    path: ['answer'],
  });
export type PinQuestion = z.infer<typeof PinQuestionSchema>;

/** A pin as the map and reader get it (from the pins_map view and the approved versions). */
export const MapPinSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  label: PinLabelSchema,
  radius_m: z.number(),
  topics: z.array(z.string()),
  status: PinStatusSchema,
  is_sample: z.boolean(),
  place_kind: z.enum(['ped_node', 'osm', 'custom']),
  place_description: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
});
export type MapPin = z.infer<typeof MapPinSchema>;

/** Which reading version to show: the user's style if it exists, else the nearest one, adult last. */
export function pickVersion<T extends { reading_level: ReadingLevel }>(
  versions: readonly T[],
  style: ReadingLevel,
): T | null {
  const order: Record<ReadingLevel, ReadingLevel[]> = {
    child: ['child', 'teen', 'adult'],
    teen: ['teen', 'adult', 'child'],
    adult: ['adult', 'teen', 'child'],
  };
  for (const level of order[style]) {
    const found = versions.find((v) => v.reading_level === level);
    if (found) return found;
  }
  return null;
}
