import { describe, expect, it } from 'vitest';

import { catchMessage, catchPlan, fasterAlternative } from './live-trip.ts';
import type { StopArrival } from './transit/eta-schema.ts';
import type { TripOption } from './trip-schema.ts';

const NOW = Date.parse('2026-10-18T08:20:00+08:00');
const train = (hhmm: string): StopArrival => ({
  route: 'KTL',
  dest_en: 'Whampoa',
  dest_zh: '黃埔',
  dest_code: 'WHA',
  at: `2026-10-18T${hhmm}:00+08:00`,
  platform: '2',
  realtime: true,
  remark: null,
});

describe('when to leave for the train', () => {
  it('tells you how long you have for the next one', () => {
    // 5 min walk + 1 min to board: leave by 08:24 for the 08:30.
    const plan = catchPlan([train('08:30'), train('08:36')], 300, NOW);
    expect(plan).toMatchObject({ kind: 'leave', leaveInS: 240 });
    expect(catchMessage(plan, 'KTL')).toBe('Leave in 4 min for the 08:30 KTL');
  });

  it('says leave now when there is under a minute', () => {
    const plan = catchPlan([train('08:26')], 300, NOW - 30_000); // 30 s before you must leave
    expect(catchMessage(plan, 'KTL')).toBe('Leave now for the 08:26 KTL');
  });

  it('moves you to the following one when you would miss the next', () => {
    const plan = catchPlan([train('08:23'), train('08:31')], 300, NOW);
    expect(plan.kind).toBe('missed_next');
    expect(catchMessage(plan, 'KTL')).toBe(
      "You'd miss the 08:23 — leave in 5 min for the 08:31 KTL",
    );
  });

  it('is honest when nothing reachable is listed', () => {
    expect(catchPlan([train('08:19')], 300, NOW)).toEqual({ kind: 'none' });
    expect(catchPlan([train('08:22')], 300, NOW)).toEqual({ kind: 'none' });
    expect(catchMessage({ kind: 'none' }, 'KTL')).toMatch(/No KTL departures/);
  });
});

describe('faster route after a traffic refresh', () => {
  const car = (id: string, total_s: number, mode: TripOption['mode'] = 'car') =>
    ({ id, mode, total_s, title: id }) as TripOption;

  it('offers a same-mode route that now saves 3 min or more', () => {
    const picked = car('car-0', 900);
    expect(fasterAlternative(picked, [car('car-0', 1200), car('car-1', 950)])?.id).toBe('car-1');
    expect(fasterAlternative(picked, [car('car-0', 1000), car('car-1', 900)])).toBeNull(); // 100 s
  });

  it('never suggests another mode, and ignores walking/transit picks', () => {
    expect(fasterAlternative(car('car-0', 1200), [car('taxi-0', 600, 'taxi')])).toBeNull();
    expect(fasterAlternative(car('walk-x', 900, 'walk'), [car('walk-y', 100, 'walk')])).toBeNull();
  });
});
