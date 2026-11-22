import { describe, expect, it } from 'vitest';

import {
  CONSENT_VERSION,
  defaultReadingStyle,
  featureRules,
  needsConsent,
  safetyModeFor,
} from './safety.ts';

describe('safety mode', () => {
  it('is on for under-18s and off for adults', () => {
    expect(safetyModeFor('under_18')).toBe(true);
    expect(safetyModeFor('adult')).toBe(false);
  });

  it('turns off recording, friends, shop offers and points, and keeps the collection on the device', () => {
    expect(featureRules({ safety_mode: true })).toEqual({
      recordRoutes: false,
      friends: false,
      shopOffers: false,
      points: false,
      collectionOnServer: false,
      dataSharingOptIns: false,
    });
  });

  it('adults get every feature', () => {
    expect(Object.values(featureRules({ safety_mode: false })).every(Boolean)).toBe(true);
  });

  it('unknown settings (not answered, or offline) are treated as safety mode', () => {
    expect(featureRules(null)).toEqual(featureRules({ safety_mode: true }));
  });

  it("reading style doesn't change it: a child reading the adult version keeps safety mode", () => {
    // Safety mode is computed from the age band only; the reading style isn't an input.
    expect(safetyModeFor('under_18')).toBe(true);
    expect(defaultReadingStyle('under_18')).toBe('teen');
    expect(defaultReadingStyle('adult')).toBe('adult');
  });
});

describe('needsConsent', () => {
  it('asks when never answered or when the consent text changed', () => {
    expect(needsConsent(null)).toBe(true);
    expect(needsConsent({ consent_version: 'older' })).toBe(true);
    expect(needsConsent({ consent_version: CONSENT_VERSION })).toBe(false);
  });
});
