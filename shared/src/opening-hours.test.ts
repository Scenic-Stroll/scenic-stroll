import { describe, expect, it } from 'vitest';

import { closesAt, hongKongTime, isOpenAt, parseOpeningHours } from './opening-hours.ts';

/** A moment in Hong Kong time, e.g. hk('2026-10-14 10:00') (that day is a Wednesday). */
const hk = (local: string) => new Date(`${local.replace(' ', 'T')}:00+08:00`);

describe('hongKongTime', () => {
  it('converts to Hong Kong day and minute', () => {
    expect(hongKongTime(hk('2026-10-14 10:30'))).toEqual({ day: 3, minute: 630 });
    expect(hongKongTime(new Date('2026-10-14T23:30:00Z'))).toEqual({ day: 4, minute: 450 }); // Thu 07:30 HK
  });
});

describe('parseOpeningHours', () => {
  it('reads day ranges, lists and "off"', () => {
    const [weekdays, sat, off] = parseOpeningHours(
      'Mo-Fr 08:00-19:30; Sa 08:00-13:00; We 09:00-11:00 off',
    );
    expect([...weekdays!.days].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(sat).toMatchObject({ from: 480, to: 780, off: false });
    expect(off?.off).toBe(true);
    expect([...parseOpeningHours('Sa,Su 10:00-18:00')[0]!.days].sort()).toEqual([0, 6]);
  });

  it('skips rules it cannot read (public holidays)', () => {
    expect(parseOpeningHours('PH 10:00-12:00')).toEqual([]);
  });
});

describe('isOpenAt', () => {
  it('no hours = always open', () => {
    expect(isOpenAt(null, hk('2026-10-14 03:00'))).toBe(true);
  });

  it('Festival Walk: 07:00 to midnight', () => {
    const fw = 'Mo-Su 07:00-24:00';
    expect(isOpenAt(fw, hk('2026-10-14 06:59'))).toBe(false);
    expect(isOpenAt(fw, hk('2026-10-14 07:00'))).toBe(true);
    expect(isOpenAt(fw, hk('2026-10-14 23:59'))).toBe(true);
    expect(isOpenAt(fw, hk('2026-10-15 00:30'))).toBe(false);
  });

  it('weekday + Saturday morning hours are closed on Sunday', () => {
    const h = 'Mo-Fr 08:00-19:30; Sa 08:00-13:00';
    expect(isOpenAt(h, hk('2026-10-17 12:00'))).toBe(true); // Saturday
    expect(isOpenAt(h, hk('2026-10-17 14:00'))).toBe(false);
    expect(isOpenAt(h, hk('2026-10-18 12:00'))).toBe(false); // Sunday
  });

  it('a lift closed for maintenance on Wednesday 9–11', () => {
    const lift = 'Mo-Su 00:00-24:00; We 09:00-11:00 off';
    expect(isOpenAt(lift, hk('2026-10-14 10:00'))).toBe(false); // Wednesday
    expect(isOpenAt(lift, hk('2026-10-14 11:00'))).toBe(true);
    expect(isOpenAt(lift, hk('2026-10-15 10:00'))).toBe(true); // Thursday
  });

  it('ranges past midnight', () => {
    const late = 'Fr 22:00-02:00';
    expect(isOpenAt(late, hk('2026-10-16 23:00'))).toBe(true); // Friday night
    expect(isOpenAt(late, hk('2026-10-17 01:00'))).toBe(true); // early Saturday
    expect(isOpenAt(late, hk('2026-10-17 03:00'))).toBe(false);
  });

  it('unreadable hours count as open', () => {
    expect(isOpenAt('sunrise-sunset', hk('2026-10-14 03:00'))).toBe(true);
  });
});

describe('closesAt', () => {
  const hk = (s: string) => new Date(`${s}+08:00`);

  it('gives the next closing time, rounded to the minute', () => {
    expect(closesAt('Mo-Su 07:00-22:00', hk('2026-10-16T21:41:30'))).toEqual(
      hk('2026-10-16T22:00:00'),
    );
  });

  it('handles midnight and maintenance windows', () => {
    expect(closesAt('Mo-Su 07:00-24:00', hk('2026-10-16T23:40:00'))).toEqual(
      hk('2026-10-17T00:00:00'),
    );
    // 2026-10-21 is a Wednesday: lift off 09:00–11:00.
    expect(closesAt('Mo-Su 00:00-24:00; We 09:00-11:00 off', hk('2026-10-21T08:30:00'))).toEqual(
      hk('2026-10-21T09:00:00'),
    );
  });

  it('is null when always open, open for 24 h, or already closed', () => {
    expect(closesAt(null, hk('2026-10-16T12:00:00'))).toBeNull();
    expect(closesAt('Mo-Su 00:00-24:00', hk('2026-10-16T12:00:00'))).toBeNull();
    expect(closesAt('Mo-Su 07:00-22:00', hk('2026-10-16T23:00:00'))).toBeNull();
  });
});
