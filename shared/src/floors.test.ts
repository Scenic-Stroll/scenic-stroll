import { describe, expect, it } from 'vitest';

import { floorsFromCheckpoints, isOnFloor, normalizeFloor, sortFloors } from './floors.ts';

describe('sortFloors', () => {
  it('orders Hong Kong floor names from the bottom up', () => {
    expect(sortFloors(['L2', 'G', 'B1', 'UG', 'LG1', 'L10', 'B2', 'LG2', 'L1'])).toEqual([
      'B2',
      'B1',
      'LG2',
      'LG1',
      'G',
      'UG',
      'L1',
      'L2',
      'L10',
    ]);
  });

  it('understands 3/F style and puts unknown names on top', () => {
    expect(sortFloors(['PODIUM', '3/F', 'G', '1/F'])).toEqual(['G', '1/F', '3/F', 'PODIUM']);
  });

  it('removes duplicates', () => {
    expect(sortFloors(['G', 'G', 'L1'])).toEqual(['G', 'L1']);
  });
});

describe('floorsFromCheckpoints', () => {
  it('collects from- and to-floors, normalised and sorted', () => {
    const cps = [
      { floor_from: 'ug', floor_to: ' L2 ' },
      { floor_from: null, floor_to: 'UG' },
      { floor_from: null, floor_to: null },
    ];
    expect(floorsFromCheckpoints(cps)).toEqual(['UG', 'L2']);
  });

  it('is empty when no checkpoint has floors (the selector then stays hidden)', () => {
    expect(floorsFromCheckpoints([{ floor_from: null, floor_to: null }])).toEqual([]);
  });
});

describe('isOnFloor', () => {
  const lift = { floor_from: 'G', floor_to: 'L2' };
  it('a lift belongs to both of its floors', () => {
    expect(isOnFloor(lift, 'G')).toBe(true);
    expect(isOnFloor(lift, 'l2')).toBe(true);
    expect(isOnFloor(lift, 'L1')).toBe(false);
  });

  it('normalizeFloor trims and uppercases, empty → null', () => {
    expect(normalizeFloor(' ug ')).toBe('UG');
    expect(normalizeFloor('   ')).toBeNull();
    expect(normalizeFloor(null)).toBeNull();
  });
});
