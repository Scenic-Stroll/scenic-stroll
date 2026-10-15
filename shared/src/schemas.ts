/**
 * zod schemas shared by the app and the Edge Functions.
 * The enum values here MUST match the Postgres enums in supabase/migrations.
 */
import { z } from 'zod';

import { TAGS } from './taxonomy.ts';

export const TagSchema = z.enum(TAGS);

/** Checkpoints a user can drop while recording (how we capture floors indoors). */
export const CHECKPOINT_KINDS = [
  'lift',
  'escalator',
  'stairs',
  'entrance',
  'footbridge',
  'underpass',
  'note',
] as const;
export const CheckpointKindSchema = z.enum(CHECKPOINT_KINDS);
export type CheckpointKind = z.infer<typeof CheckpointKindSchema>;

export const ROUTE_STATUSES = ['unverified', 'verified', 'flagged', 'retired'] as const;
export const RouteStatusSchema = z.enum(ROUTE_STATUSES);
export type RouteStatus = z.infer<typeof RouteStatusSchema>;

export const REPORT_REASONS = [
  'blocked',
  'closed_hours',
  'wrong',
  'unsafe',
  'spam',
  'other',
] as const;
export const ReportReasonSchema = z.enum(REPORT_REASONS);
export type ReportReason = z.infer<typeof ReportReasonSchema>;

export const TAG_VALUES = ['true', 'partial'] as const;
export const TagValueSchema = z.enum(TAG_VALUES);

export const DETECTED_LANGS = ['en', 'zh-HK', 'mixed'] as const;
export const DetectedLangSchema = z.enum(DETECTED_LANGS);

/** A WGS84 coordinate. Hong Kong is roughly lat 22.1–22.6, lng 113.8–114.5. */
export const LatLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof LatLngSchema>;

/**
 * One tag as the LLM returns it, BEFORE our own checks.
 * `tag` is a plain string on purpose: unknown tags are dropped by the validator, not rejected
 * as a whole response (see Phase 3).
 */
export const RawLlmTagSchema = z.object({
  tag: z.string(),
  value: TagValueSchema,
  confidence: z.number().min(0).max(1),
  evidence: z.string(),
});

/** The full structured output we ask the LLM for in `tag-route`. */
export const LlmTaggingOutputSchema = z.object({
  detected_lang: DetectedLangSchema,
  tags: z.array(RawLlmTagSchema),
  summary_en: z.string().max(400),
  summary_zh: z.string().max(400),
});
export type LlmTaggingOutput = z.infer<typeof LlmTaggingOutputSchema>;
