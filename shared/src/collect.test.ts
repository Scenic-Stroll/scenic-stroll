import { describe, expect, it } from 'vitest';

import {
  collectStep,
  EMPTY_COLLECT_STATE,
  type CollectablePin,
  type CollectState,
} from './collect.ts';

const PIN: CollectablePin = { id: 'kent-road', lat: 22.3372, lng: 114.1745, radius_m: 40 };
const NONE = new Set<string>();
const M = 1 / 111_320; // one metre north, in degrees of latitude

/** Feeds fixes [metres north of the pin, accuracy, seconds] and returns everything collected. */
function walk(fixes: [number, number | null, number][], collected = NONE) {
  let state: CollectState = EMPTY_COLLECT_STATE;
  const got: string[] = [];
  for (const [north, accuracy, s] of fixes) {
    const r = collectStep(
      state,
      { lat: PIN.lat + north * M, lng: PIN.lng, accuracy, timestamp: 1_000_000 + s * 1000 },
      [PIN],
      collected,
    );
    state = r.state;
    got.push(...r.collected);
  }
  return got;
}

describe('collecting a pin', () => {
  it('two good fixes in a row inside the radius collect it', () => {
    expect(
      walk([
        [10, 8, 0],
        [12, 8, 2],
      ]),
    ).toEqual(['kent-road']);
  });

  it('one fix inside is not enough (it might be drift)', () => {
    expect(walk([[10, 8, 0]])).toEqual([]);
    expect(
      walk([
        [10, 8, 0],
        [80, 8, 30],
      ]),
    ).toEqual([]); // the next fix was outside
  });

  it('outside the radius never collects', () => {
    expect(
      walk([
        [60, 8, 0],
        [55, 8, 3],
        [50, 8, 6],
      ]),
    ).toEqual([]);
  });

  it('fixes worse than 30 m accuracy are ignored, even inside', () => {
    expect(
      walk([
        [5, 45, 0],
        [6, 50, 2],
        [5, null, 4],
      ]),
    ).toEqual([]);
  });

  it('after a vague fix, it takes 5 s inside', () => {
    // inside, vague, inside 3 s later → not yet; inside again at 6 s → collected.
    expect(
      walk([
        [10, 8, 0],
        [10, 60, 1],
        [11, 8, 3],
      ]),
    ).toEqual([]);
    expect(
      walk([
        [10, 8, 0],
        [10, 60, 1],
        [11, 8, 3],
        [12, 8, 6],
      ]),
    ).toEqual(['kent-road']);
    // inside, vague, inside ≥ 5 s later → collected straight away.
    expect(
      walk([
        [10, 8, 0],
        [10, 60, 2],
        [11, 8, 5],
      ]),
    ).toEqual(['kent-road']);
  });

  it('drift between tall buildings: a fix that jumps in from far away is ignored', () => {
    // 300 m away, then "inside" one second later (300 m/s): a GPS jump, not a walker.
    expect(
      walk([
        [300, 8, 0],
        [10, 8, 1],
        [300, 8, 2],
      ]),
    ).toEqual([]);
  });

  it('a pin already in the collection is not collected again', () => {
    expect(
      walk(
        [
          [10, 8, 0],
          [12, 8, 2],
        ],
        new Set(['kent-road']),
      ),
    ).toEqual([]);
  });
});
