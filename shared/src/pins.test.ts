import { describe, expect, it } from 'vitest';

import { PinQuestionSchema, pickVersion, PlaceRefSchema } from './pins.ts';

describe('PlaceRefSchema', () => {
  it('accepts the three kinds of place', () => {
    expect(PlaceRefSchema.safeParse({ kind: 'ped_node', build_id: 1, node_id: 42 }).success).toBe(
      true,
    );
    expect(PlaceRefSchema.safeParse({ kind: 'osm', osm_id: 'node/123' }).success).toBe(true);
    expect(
      PlaceRefSchema.safeParse({ kind: 'custom', description: 'Boundary stone by the steps' })
        .success,
    ).toBe(true);
  });

  it('a custom place needs a description; OSM ids need their type', () => {
    expect(PlaceRefSchema.safeParse({ kind: 'custom', description: ' ' }).success).toBe(false);
    expect(PlaceRefSchema.safeParse({ kind: 'osm', osm_id: '123' }).success).toBe(false);
  });
});

describe('PinQuestionSchema', () => {
  const q = {
    prompt: 'Which side of Boundary Street is Kent Road on?',
    options: ['Kowloon', 'New Kowloon'],
    answer: 'New Kowloon',
    explanation: 'North of Boundary Street was leased in 1898.',
  };

  it('accepts a question whose answer is one of the options', () => {
    expect(PinQuestionSchema.safeParse(q).success).toBe(true);
  });

  it('rejects an answer that is not an option, and fewer than 2 options', () => {
    expect(PinQuestionSchema.safeParse({ ...q, answer: 'Hong Kong Island' }).success).toBe(false);
    expect(PinQuestionSchema.safeParse({ ...q, options: ['New Kowloon'] }).success).toBe(false);
  });
});

describe('pickVersion', () => {
  const v = (reading_level: 'child' | 'teen' | 'adult') => ({ reading_level });

  it("uses the reader's style when that version is approved", () => {
    expect(pickVersion([v('adult'), v('child')], 'child')).toEqual(v('child'));
  });

  it('falls back to the nearest level (adult only exists → adult)', () => {
    expect(pickVersion([v('adult')], 'child')).toEqual(v('adult'));
    expect(pickVersion([v('child'), v('adult')], 'teen')).toEqual(v('adult'));
    expect(pickVersion([], 'adult')).toBeNull();
  });
});
