import { describe, expect, it } from 'vitest';

import { badgesFor, LEVELS, levelFor, pointsFor, type BadgeInput } from './levels.ts';

describe('pointsFor', () => {
  it('follows the build prompt: +10 route, +5 description, +5 verified walk, +20 route verified', () => {
    expect(pointsFor({ routes: 1, descriptions: 0, verifiedWalks: 0, routesVerified: 0 })).toBe(10);
    expect(pointsFor({ routes: 2, descriptions: 1, verifiedWalks: 3, routesVerified: 1 })).toBe(60);
  });
});

describe('levelFor', () => {
  it('starts as Newcomer at 0 points', () => {
    expect(levelFor(0)).toMatchObject({
      number: 1,
      name: 'Newcomer',
      nextAt: 50,
      pointsToNext: 50,
      progress: 0,
    });
  });

  it('changes level exactly at each threshold', () => {
    expect(levelFor(49).name).toBe('Newcomer');
    expect(levelFor(50).name).toBe('Explorer');
    expect(levelFor(150).name).toBe('Local Guide');
    expect(levelFor(400).name).toBe('Route Master');
    expect(levelFor(1000).name).toBe('Legend');
  });

  it('reports progress and points to the next level ("Level 3 · Local Guide — 40 pts to next")', () => {
    const l = levelFor(360);
    expect(l).toMatchObject({ number: 3, name: 'Local Guide', nextAt: 400, pointsToNext: 40 });
    expect(l.progress).toBeCloseTo((360 - 150) / (400 - 150));
  });

  it('is complete at the top level', () => {
    expect(levelFor(5000)).toMatchObject({
      name: 'Legend',
      nextAt: null,
      pointsToNext: null,
      progress: 1,
    });
  });

  it('treats negative or fractional points safely', () => {
    expect(levelFor(-10).name).toBe('Newcomer');
    expect(levelFor(49.9).name).toBe('Newcomer');
  });

  it('levels are in ascending order', () => {
    for (let i = 1; i < LEVELS.length; i++)
      expect(LEVELS[i]!.min).toBeGreaterThan(LEVELS[i - 1]!.min);
  });
});

describe('badgesFor', () => {
  const none: BadgeInput = {
    routesLogged: 0,
    liftCheckpoints: 0,
    shelteredRoutes: 0,
    routesVerified: 0,
    weeklyRank: null,
  };

  it('nothing earned for a new user, but every badge explains how to earn it', () => {
    const badges = badgesFor(none);
    expect(badges.every((b) => !b.earned)).toBe(true);
    expect(badges.every((b) => b.howToEarn.length > 10)).toBe(true);
  });

  it('awards badges at their thresholds', () => {
    const earned = (input: Partial<BadgeInput>) =>
      badgesFor({ ...none, ...input })
        .filter((b) => b.earned)
        .map((b) => b.id);
    expect(earned({ routesLogged: 1 })).toEqual(['first_route']);
    expect(earned({ liftCheckpoints: 3 })).toEqual(['lift_finder']);
    expect(earned({ shelteredRoutes: 2 })).toEqual([]);
    expect(earned({ shelteredRoutes: 3 })).toEqual(['shelter_scout']);
    expect(earned({ routesVerified: 1 })).toEqual(['verified_contributor']);
    expect(earned({ weeklyRank: 2 })).toEqual([]);
    expect(earned({ weeklyRank: 1 })).toEqual(['top_contributor']);
  });
});
