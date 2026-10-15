import { describe, expect, it } from 'vitest';

import { formatDistance, formatDuration } from './format.ts';

describe('formatDuration', () => {
  it.each([
    [20, '< 1 min'],
    [90, '2 min'],
    [3600, '1 h'],
    [4500, '1 h 15 min'],
    [-1, '–'],
    [Number.NaN, '–'],
  ])('%s s → %s', (s, expected) => {
    expect(formatDuration(s)).toBe(expected);
  });
});

describe('formatDistance', () => {
  it.each([
    [0, '0 m'],
    [447, '450 m'],
    [999, '1.0 km'],
    [1000, '1.0 km'],
    [1260, '1.3 km'],
    [-5, '–'],
  ])('%s m → %s', (m, expected) => {
    expect(formatDistance(m)).toBe(expected);
  });
});
