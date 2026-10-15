import { describe, expect, it } from 'vitest';

import { nearestPresets, PRESETS } from './presets.ts';
import { buildSegments } from './segments.ts';

describe('buildSegments', () => {
  it('a route without checkpoints is one outdoor segment (the standard route)', () => {
    expect(buildSegments([])).toEqual(['outdoor']);
  });

  it('entrances toggle indoor/outdoor; a lift sits between indoor parts', () => {
    // MTR exit → enter Festival Walk → lift G→L2 → leave by the L2 footbridge entrance
    expect(buildSegments(['entrance', 'lift', 'entrance'])).toEqual([
      'outdoor',
      'indoor',
      'lift',
      'indoor',
      'outdoor',
    ]);
  });

  it('an outdoor footbridge is its own segment, then back outdoor', () => {
    expect(buildSegments(['footbridge'])).toEqual(['outdoor', 'footbridge', 'outdoor']);
  });

  it('notes do not change the strip', () => {
    expect(buildSegments(['note', 'note'])).toEqual(['outdoor']);
  });

  it('changing lifts shows both lifts with the indoor walk between them', () => {
    expect(buildSegments(['entrance', 'lift', 'lift'])).toEqual([
      'outdoor',
      'indoor',
      'lift',
      'indoor',
      'lift',
      'indoor',
    ]);
  });

  it('never repeats the same segment twice in a row', () => {
    const s = buildSegments(['entrance', 'note', 'entrance', 'entrance', 'footbridge']);
    for (let i = 1; i < s.length; i++) expect(s[i]).not.toBe(s[i - 1]);
  });
});

describe('nearestPresets', () => {
  const yeung = PRESETS.find((p) => p.id === 'cityu-yeung')!;

  it('returns MTR exits sorted by distance', () => {
    const exits = nearestPresets(yeung.point, { kind: 'mtr_exit', limit: 3 });
    expect(exits).toHaveLength(3);
    expect(exits[0]!.distanceM).toBeLessThanOrEqual(exits[1]!.distanceM);
    expect(exits.every((e) => e.preset.kind === 'mtr_exit')).toBe(true);
  });

  it('excludes the place itself (distance 0)', () => {
    const near = nearestPresets(yeung.point, { limit: 5 });
    expect(near.some((n) => n.preset.id === 'cityu-yeung')).toBe(false);
  });
});
