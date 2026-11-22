import { describe, expect, it } from 'vitest';

import {
  distancePointsAdded,
  distancePointsForDay,
  hkDay,
  pinReadEarns,
  ringProgress,
  stepsFromMeters,
  walkMetersByDay,
} from './points.ts';
import { POINTS_RULES } from './pointsRules.ts';

describe('steps', () => {
  it('0.75 km is 1,000 steps; 3 km is 4,000', () => {
    expect(stepsFromMeters(750)).toBe(1000);
    expect(stepsFromMeters(3000)).toBe(4000);
  });
});

describe('distance points per day', () => {
  it('3 km = 4,000 steps = 100 points', () => {
    expect(distancePointsForDay(stepsFromMeters(3000))).toBe(100);
  });

  it('each tier pays its own rate', () => {
    expect(distancePointsForDay(6000)).toBe(150); // 6 × 25
    expect(distancePointsForDay(8000)).toBe(250); // + 2 × 50
    expect(distancePointsForDay(9000)).toBe(350); // + 1 × 100
  });

  it('10,000 steps or more = 450, the daily maximum', () => {
    expect(distancePointsForDay(10000)).toBe(450);
    expect(distancePointsForDay(25000)).toBe(450);
    expect(POINTS_RULES.dailyMaxDistancePoints).toBe(450);
  });

  it('partial thousands count in proportion, rounded down', () => {
    expect(distancePointsForDay(500)).toBe(12); // 12.5 → 12
    expect(distancePointsForDay(6500)).toBe(175); // 150 + 25
    expect(distancePointsForDay(0)).toBe(0);
  });

  it("several walks in one day add up to the day's points (tiers and cap per day)", () => {
    const first = distancePointsAdded(0, 5000);
    const second = distancePointsAdded(5000, 4000);
    const third = distancePointsAdded(9000, 5000);
    expect(first + second + third).toBe(distancePointsForDay(14000));
    expect(third).toBe(100); // only the 1,000 steps left below the cap pay
    expect(distancePointsAdded(12000, 3000)).toBe(0); // already at the cap
  });
});

describe('Hong Kong days', () => {
  it('splits at midnight Hong Kong time, not UTC', () => {
    expect(hkDay(Date.UTC(2026, 10, 23, 15, 59))).toBe('2026-11-23'); // 23:59 HKT
    expect(hkDay(Date.UTC(2026, 10, 23, 16, 0))).toBe('2026-11-24'); // 00:00 HKT
  });
});

/** A straight walk north: `n` fixes `stepM` metres and `stepS` seconds apart. */
function walk(n: number, stepM: number, stepS: number, startMs = Date.UTC(2026, 10, 23, 2)) {
  return Array.from({ length: n }, (_, i) => ({
    lat: 22.33 + (i * stepM) / 111_320,
    lng: 114.17,
    accuracy: 5,
    timestamp: startMs + i * stepS * 1000,
  }));
}

describe('speed check', () => {
  it('walking (5 km/h) counts in full', () => {
    const day = walkMetersByDay(walk(61, 14, 10)); // 840 m in 10 min = 5 km/h
    expect(Math.abs(day['2026-11-23']!.countedM - 840)).toBeLessThan(5);
    expect(day['2026-11-23']!.tooFastM).toBe(0);
  });

  it('a bus (25 km/h) earns nothing', () => {
    const day = walkMetersByDay(walk(61, 70, 10)); // 25.2 km/h
    expect(day['2026-11-23']!.countedM).toBe(0);
    expect(day['2026-11-23']!.tooFastM).toBeGreaterThan(4000);
  });

  it('a short burst faster than 7 km/h (under 30 s) still counts', () => {
    const slow = walk(13, 13, 10); // 2 min at ~4.7 km/h
    const last = slow.at(-1)!;
    // One 10-second stretch at 9 km/h, then walking again.
    const burst = { ...last, lat: last.lat + 25 / 111_320, timestamp: last.timestamp + 10_000 };
    const after = walk(13, 13, 10, burst.timestamp + 10_000).map((p) => ({
      ...p,
      lat: p.lat - 22.33 + burst.lat,
    }));
    const day = walkMetersByDay([...slow, burst, ...after])['2026-11-23']!;
    expect(day.tooFastM).toBe(0);
  });

  it('wheeling counts the same as walking: only distance and speed matter', () => {
    const wheelchair = walkMetersByDay(walk(61, 16, 10))['2026-11-23']!; // 5.8 km/h
    expect(wheelchair.tooFastM).toBe(0);
  });
});

describe('pin-read points', () => {
  const read = { collected: true, openedAtMs: 0, finishedAtMs: 10_000, alreadyAwarded: false };

  it('a collected pin read for ≥ 10 s earns, once', () => {
    expect(pinReadEarns(read)).toBe(true);
    expect(pinReadEarns({ ...read, alreadyAwarded: true })).toBe(false);
  });

  it('reading too quickly, or a pin that was not collected, earns nothing', () => {
    expect(pinReadEarns({ ...read, finishedAtMs: 9_999 })).toBe(false);
    expect(pinReadEarns({ ...read, collected: false })).toBe(false);
  });
});

describe('daily ring', () => {
  it('fills up to 10,000 steps', () => {
    expect(ringProgress(5000)).toBe(0.5);
    expect(ringProgress(15000)).toBe(1);
  });
});
