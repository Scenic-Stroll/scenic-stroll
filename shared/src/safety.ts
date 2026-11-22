/**
 * Consent, age band and safety mode (docs/PINS.md, D52).
 *
 * Safety mode is ON for every under-18 account and can't be turned off — not in the app (there is no
 * switch) and not through the API (the database computes it from the age band, refuses a change
 * back to adult, and refuses recordings, friends and location sharing for under-18s).
 * Reading style is a separate choice: a child who picks the "adult" reading style keeps safety mode.
 */
import { z } from 'zod';

import { ReadingLevelSchema, type ReadingLevel } from './pins.ts';

/** Bump when the consent text changes; everyone is asked again. */
export const CONSENT_VERSION = '2026-11';

export const AgeBandSchema = z.enum(['under_18', 'adult']);
export type AgeBand = z.infer<typeof AgeBandSchema>;

/** A row of public.user_settings as the app reads it. */
export const UserSettingsSchema = z.object({
  age_band: AgeBandSchema,
  safety_mode: z.boolean(),
  reading_style: ReadingLevelSchema,
  research_opt_in: z.boolean(),
  gov_sharing_opt_in: z.boolean(),
  consent_version: z.string(),
  consented_at: z.string(),
});
export type UserSettings = z.infer<typeof UserSettingsSchema>;

/** Safety mode follows the age band — the same rule as the database's generated column. */
export function safetyModeFor(ageBand: AgeBand): boolean {
  return ageBand === 'under_18';
}

/** A sensible first reading style; anyone can change it later in Profile. */
export function defaultReadingStyle(ageBand: AgeBand): ReadingLevel {
  return ageBand === 'under_18' ? 'teen' : 'adult';
}

/** Show the consent screen: never answered, or the consent text changed since. */
export function needsConsent(settings: Pick<UserSettings, 'consent_version'> | null): boolean {
  return settings === null || settings.consent_version !== CONSENT_VERSION;
}

export type FeatureRules = {
  recordRoutes: boolean;
  friends: boolean;
  shopOffers: boolean;
  /** false = badges only. */
  points: boolean;
  /** false = collection and read state stay on the device; only "pin unlocked" (pin, day) is sent. */
  collectionOnServer: boolean;
  /** Research / government opt-ins are offered only to adults. */
  dataSharingOptIns: boolean;
};

/**
 * What the app may offer. Unknown settings (not answered yet, or not loaded offline) get the
 * safest answer, so nothing slips through before the consent screen.
 */
export function featureRules(settings: Pick<UserSettings, 'safety_mode'> | null): FeatureRules {
  const adult = settings !== null && !settings.safety_mode;
  return {
    recordRoutes: adult,
    friends: adult,
    shopOffers: adult,
    points: adult,
    collectionOnServer: adult,
    dataSharingOptIns: adult,
  };
}
