import { describe, expect, it } from 'vitest';

import { TripOptionSchema } from '../trip-schema.ts';
import { parseCtbEta, parseGmbStopEta, parseKmbStopEta, parseMtrSchedule } from './eta-parse.ts';
import type { StopArrival } from './eta-schema.ts';
import { etaStop } from './eta-stop.ts';
import { arrivalsForLeg, BOARDING_BUFFER_S, withLiveDepartures } from './live-departures.ts';
import { mtrBoarding, mtrLinesAt, mtrUsefulDests } from './mtr-lines.ts';
import { DEMO_STOPS } from './demo-stops.ts';
import { planMtrTrips } from './mtr-planner.ts';
import { findStop } from './stops.ts';
import { transitTripFromPlan } from './transit-plan.ts';

// Shapes copied from the real APIs on 2026-10-18 (times shortened).
const MTR = {
  sys_time: '2026-10-18 08:20:00',
  isdelay: 'N',
  data: {
    'KTL-KOT': {
      UP: [
        { seq: '1', dest: 'TIK', plat: '1', time: '2026-10-18 08:23:00', valid: 'Y' },
        { seq: '2', dest: 'TIK', plat: '1', time: '2026-10-18 08:27:00', valid: 'Y' },
      ],
      DOWN: [
        { seq: '1', dest: 'WHA', plat: '2', time: '2026-10-18 08:22:00', valid: 'Y' },
        { seq: '2', dest: 'WHA', plat: '2', time: '2026-10-18 08:25:30', valid: 'Y' },
        { seq: '3', dest: 'WHA', plat: '2', time: '2026-10-18 08:29:00', valid: 'Y' },
      ],
    },
  },
};

const KMB = {
  type: 'StopETA',
  data: [
    {
      co: 'KMB',
      route: '2B',
      service_type: 1,
      dest_en: 'CHEUNG SHA WAN',
      dest_tc: '長沙灣',
      eta: '2026-10-18T08:26:00+08:00',
      rmk_en: '',
    },
    {
      co: 'KMB',
      route: '2B',
      service_type: 2,
      dest_en: 'CHEUNG SHA WAN',
      dest_tc: '長沙灣',
      eta: '2026-10-18T08:26:00+08:00',
      rmk_en: '',
    },
    {
      co: 'KMB',
      route: '86C',
      dest_en: 'CHEUNG SHA WAN',
      dest_tc: '長沙灣',
      eta: '2026-10-18T08:24:00+08:00',
      rmk_en: 'Scheduled Bus',
    },
    { co: 'KMB', route: '2F', dest_en: 'CHEUNG SHA WAN', dest_tc: '長沙灣', eta: null, rmk_en: '' },
  ],
};

describe('real-time answers → arrivals', () => {
  it('reads MTR Next Train (Hong Kong local time, terminus code kept)', () => {
    const a = parseMtrSchedule(MTR, 'KTL', 'KOT');
    expect(a).toHaveLength(5);
    expect(a[0]).toMatchObject({
      route: 'KTL',
      dest_en: 'Whampoa',
      dest_code: 'WHA',
      platform: '2',
    });
    expect(Date.parse(a[0]!.at)).toBe(Date.parse('2026-10-18T00:22:00Z'));
    expect(() => parseMtrSchedule({ status: 0, message: 'Suspended' }, 'KTL', 'KOT')).toThrow(
      /Suspended/,
    );
  });

  it('reads KMB: drops empty and repeated rows, marks scheduled buses as not live', () => {
    const a = parseKmbStopEta(KMB);
    expect(a.map((x) => x.route)).toEqual(['86C', '2B']);
    expect(a[0]).toMatchObject({ realtime: false, remark: 'Scheduled Bus' });
    expect(a[1]).toMatchObject({ realtime: true, dest_en: 'Cheung Sha Wan', dest_zh: '長沙灣' });
    expect(() => parseKmbStopEta({ message: 'error' })).toThrow();
  });

  it('reads Citybus (same format as KMB, empty string = no bus)', () => {
    const a = parseCtbEta({
      data: [
        { route: '182', dest_en: 'Wah Fu', dest_tc: '華富', eta: '2026-10-18T08:30:00+08:00' },
        { route: '182', dest_en: 'Wah Fu', dest_tc: '華富', eta: '' },
      ],
    });
    expect(a).toHaveLength(1);
    expect(a[0]!.route).toBe('182');
  });

  it('reads green minibus by route id, skipping routes we do not know', () => {
    const routes = {
      '2009246': { code: '2', dest: { '1': { en: 'Festival Walk', zh: '又一城' } } },
    };
    const a = parseGmbStopEta(
      {
        data: [
          {
            route_id: 2009246,
            route_seq: 1,
            enabled: true,
            eta: [{ diff: 4, timestamp: '2026-10-18T08:24:00.000+08:00', remarks_en: null }],
          },
          {
            route_id: 999,
            route_seq: 1,
            enabled: true,
            eta: [{ timestamp: '2026-10-18T08:21:00+08:00' }],
          },
        ],
      },
      routes,
    );
    expect(a).toEqual([
      expect.objectContaining({ route: '2', dest_en: 'Festival Walk', realtime: true }),
    ]);
    expect(() => parseGmbStopEta({ code: 500, message: 'ETA unavailable' }, routes)).toThrow(
      /unavailable/,
    );
  });
});

describe('which trains are ours', () => {
  it('knows the lines at a station', () => {
    expect(mtrLinesAt('KOT')).toEqual(['EAL', 'KTL']);
  });

  it('keeps trains whose terminus is at or past our stop, on every branch', () => {
    // Kowloon Tong → Sha Tin on the East Rail: Lo Wu and Lok Ma Chau trains both stop there.
    const north = mtrUsefulDests('EAL', 'KOT', 'SHT');
    expect(north).toEqual(expect.arrayContaining(['LOW', 'LMC', 'SHT']));
    expect(north).not.toContain('ADM');
    // Kowloon Tong → Mong Kok: southbound KTL trains end at Whampoa.
    expect(mtrUsefulDests('KTL', 'KOT', 'MOK')).toContain('WHA');
    expect(mtrUsefulDests('KTL', 'KOT', 'MOK')).not.toContain('TIK');
  });

  it('filters arrivals to the right line and direction', () => {
    const a = parseMtrSchedule(MTR, 'KTL', 'KOT');
    const mine = arrivalsForLeg(a, {
      route: 'KTL',
      dest_codes: mtrUsefulDests('KTL', 'KOT', 'MOK'),
    });
    expect(mine.every((x) => x.dest_code === 'WHA')).toBe(true);
    expect(mine).toHaveLength(3);
  });
});

describe('live departures in a trip', () => {
  const CITYU = { lat: 22.336116, lng: 114.174147 };
  const MONG_KOK = { lat: 22.3193, lng: 114.1694 };
  const depart = new Date('2026-10-18T08:15:00+08:00');
  const trip = () => transitTripFromPlan(planMtrTrips(CITYU, MONG_KOK)[0]!, depart);
  const rideIndex = (t: ReturnType<typeof trip>) => t.legs.findIndex((l) => l.mode === 'transit');
  const train = (hhmmss: string, realtime = true): StopArrival => ({
    route: 'KTL',
    dest_en: 'Whampoa',
    dest_zh: '黃埔',
    dest_code: 'WHA',
    at: `2026-10-18T${hhmmss}+08:00`,
    platform: '2',
    realtime,
    remark: null,
  });

  it('plans board at Kowloon Tong on the KTL, going towards Whampoa', () => {
    const t = trip();
    const ride = t.legs[rideIndex(t)]!;
    expect(ride.boarding).toMatchObject({ stop_id: 'mtr:KOT', route: 'KTL' });
    expect(ride.boarding!.dest_codes).toContain('WHA');
  });

  it('waits for the first train you can still catch, and shifts the rest of the trip', () => {
    const t = trip();
    const i = rideIndex(t);
    const atStation = new Date(t.legs[i - 1]!.arrive_at).getTime();
    // One train leaves before we could board, the next a few minutes later.
    const tooSoon = new Date(atStation + (BOARDING_BUFFER_S - 10) * 1000);
    const catchable = new Date(atStation + 6 * 60_000);
    const hk = (d: Date) => new Date(d.getTime() + 8 * 3600_000).toISOString().slice(11, 19);
    const live = withLiveDepartures(
      t,
      new Map([[i, [train(hk(tooSoon)), train(hk(catchable))]]]),
      '2026-10-18T00:15:00Z',
    );
    const ride = live.legs[i]!;
    expect(new Date(ride.depart_at).getTime()).toBe(Math.floor(catchable.getTime() / 1000) * 1000);
    expect(ride.realtime).toBe(true);
    expect(ride.live_departures).toHaveLength(1);
    expect(live.waiting_s).toBe(360);
    expect(live.total_s - t.total_s).toBe(360 - t.waiting_s);
    expect(live.eta_at).toBe('2026-10-18T00:15:00Z');
    expect(TripOptionSchema.safeParse(live).success).toBe(true);
  });

  it('keeps the estimate when no listed train is catchable', () => {
    const t = trip();
    const live = withLiveDepartures(t, new Map([[rideIndex(t), [train('08:00:00')]]]), 'x');
    expect(live).toBe(t);
  });
});

describe('stops', () => {
  it('finds our stops near CityU and any MTR station', () => {
    expect(findStop('ctb:003065')).toMatchObject({ name_en: 'Festival Walk', operator: 'ctb' });
    expect(findStop('mtr:MOK')).toMatchObject({ name_en: 'Mong Kok', routes: ['KTL', 'TWL'] });
    expect(findStop('kmb:NOPE')).toBeNull();
    expect(DEMO_STOPS.length).toBeGreaterThan(100);
  });

  it('knows what the eta function must ask each operator', () => {
    expect(etaStop('mtr:KOT')).toMatchObject({ operator: 'mtr', routes: ['EAL', 'KTL'] });
    expect(etaStop('ctb:003065')!.routes).toEqual(['22', '702']);
    expect(etaStop('kmb:6652A2FE695AD8C2')).toMatchObject({ operator: 'kmb', routes: [] });
    expect(etaStop('ctb:999999')).toBeNull();
    expect(etaStop('mtr:XXX')).toBeNull();
  });

  it('recognises an MTR ride planned by Google by its names', () => {
    expect(mtrBoarding('Kwun Tong Line', 'Kowloon Tong Station', 'Mong Kok')).toMatchObject({
      stop_id: 'mtr:KOT',
      route: 'KTL',
    });
    expect(mtrBoarding('EAL', 'Kowloon Tong', 'Admiralty')!.dest_codes).toContain('ADM');
    expect(mtrBoarding('Bus 2', 'Kowloon Tong', 'Admiralty')).toBeNull();
  });
});
