import { describe, expect, it } from 'vitest';

import { agoLabel, formatDistance, formatDuration, formatHkTime } from './format.ts';

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

describe('agoLabel', () => {
  const now = Date.parse('2026-10-16T12:00:00Z');
  it.each([
    ['2026-10-16T11:59:40Z', 'just now'],
    ['2026-10-16T11:56:00Z', '4 min ago'],
    ['2026-10-16T09:30:00Z', '2 h ago'],
  ])('%s → %s', (when, expected) => {
    expect(agoLabel(when, now)).toBe(expected);
  });
  it('accepts a millisecond timestamp', () => {
    expect(agoLabel(now - 5 * 60_000, now)).toBe('5 min ago');
  });
});

describe('formatHkTime', () => {
  it('shows Hong Kong clock time', () => {
    expect(formatHkTime('2026-10-16T14:00:00.000Z')).toBe('22:00');
    expect(formatHkTime(new Date('2026-10-16T09:05:00+08:00'))).toBe('09:05');
  });
});
