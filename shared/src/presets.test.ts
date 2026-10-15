import { describe, expect, it } from 'vitest';

import { HkLatLngSchema } from './api.ts';
import { haversineMeters } from './geo.ts';
import { DEMO_CENTER, PRESETS, nearestPreset } from './presets.ts';

describe('PRESETS', () => {
  it('has unique ids', () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('are all inside Hong Kong and within 1.5 km of the demo centre', () => {
    for (const p of PRESETS) {
      expect(HkLatLngSchema.safeParse(p.point).success).toBe(true);
      expect(haversineMeters(p.point, DEMO_CENTER)).toBeLessThan(1500);
    }
  });

  it('every preset has an English and Chinese name', () => {
    for (const p of PRESETS) {
      expect(p.en.length).toBeGreaterThan(0);
      expect(p.zh).toMatch(/\p{Script=Han}/u);
    }
  });
});

describe('nearestPreset', () => {
  const exitC1 = PRESETS.find((p) => p.id === 'kot-exit-c1')!;

  it('snaps to a preset a few metres away', () => {
    const nearby = { lat: exitC1.point.lat + 0.0001, lng: exitC1.point.lng }; // ~11 m north
    expect(nearestPreset(nearby, 60)?.id).toBe('kot-exit-c1');
  });

  it('returns null when nothing is within range', () => {
    expect(nearestPreset({ lat: 22.3, lng: 114.2 }, 60)).toBeNull();
  });

  it('picks the closest when several are in range', () => {
    // C1 and H exits are ~13 m apart; standing exactly on H must pick H.
    const h = PRESETS.find((p) => p.id === 'kot-exit-h')!;
    expect(nearestPreset(h.point, 60)?.id).toBe('kot-exit-h');
  });
});
