import { describe, expect, it } from 'vitest';

import { at, twoWayGraph } from '../routing-test-graph.ts';
import { planSmartRoutes } from '../smart-route.ts';
import { TripOptionSchema } from '../trip-schema.ts';
import { MTR_STATIONS } from './mtr-data.ts';
import { parseMtrFaresCsv } from './mtr-fares.ts';
import { findMtrJourney, nearestStations, planMtrTrips } from './mtr-planner.ts';
import { transitTripFromPlan, withWalkLegs, type TransitPlan } from './transit-plan.ts';

const station = (en: string) => MTR_STATIONS.find((s) => s.en === en)!;
const CITYU = { lat: 22.336116, lng: 114.174147 };
const ADMIRALTY = { lat: 22.2795, lng: 114.165 };
const HKU = { lat: 22.283, lng: 114.1371 };
const AM = new Date('2026-10-19T08:30:00+08:00');

describe('MTR network data', () => {
  it('has the stations around CityU in the right place', () => {
    const kot = station('Kowloon Tong');
    expect(kot.lat).toBeCloseTo(22.337, 2);
    expect(kot.lng).toBeCloseTo(114.177, 2);
    expect(nearestStations(CITYU)[0]!.station.en).toBe('Kowloon Tong');
  });

  it('reads adult Octopus fares from the MTR fares CSV (first lines of the real file)', () => {
    const csv = [
      '\uFEFF"SRC_STATION_NAME","SRC_STATION_ID","DEST_STATION_NAME","DEST_STATION_ID","OCT_ADT_FARE","OCT_STD_FARE"',
      '"Central",1,"Central",1,0.00,0.00',
      '"Central",1,"Admiralty",2,4.90,3.20',
      'broken line',
    ].join('\r\n');
    expect(parseMtrFaresCsv(csv)).toEqual([{ src_id: 1, dest_id: 2, octopus_adult: 4.9 }]);
    expect(() => parseMtrFaresCsv('a,b,c')).toThrow(/unexpected header/);
  });
});

describe('findMtrJourney', () => {
  it('Kowloon Tong → Admiralty is one East Rail ride, no change', () => {
    const kotIds = MTR_STATIONS.filter((s) => s.en === 'Kowloon Tong').map((s) => s.id);
    const j = kotIds
      .map((id) => findMtrJourney(id, station('Admiralty').id))
      .find((x) => x && x.changeS === 0);
    expect(j).toBeTruthy();
    expect(new Set(j!.moves.map((m) => m.line.code))).toEqual(new Set(['EAL']));
  });

  it('changes line where it has to (to HKU via Admiralty)', () => {
    const [best] = planMtrTrips(CITYU, HKU);
    const rides = best!.legs.filter((l) => l.kind === 'ride');
    expect(rides.map((r) => (r.kind === 'ride' ? r.line : ''))).toEqual([
      'East Rail Line',
      'Island Line',
    ]);
  });
});

describe('planMtrTrips', () => {
  it('walk → MTR → walk, with fare, stops and an estimated label', () => {
    const plans = planMtrTrips(CITYU, ADMIRALTY);
    expect(plans.length).toBeGreaterThan(0);
    const p = plans[0]!;
    expect(p.legs[0]!.kind).toBe('walk');
    expect(p.legs.at(-1)!.kind).toBe('walk');
    // The fare is looked up later (plan-trip, public.mtr_fares): the plan says between which stations.
    expect(p.fare_hkd).toBeNull();
    expect(p.mtr?.to_id).toBe(station('Admiralty').id);
    expect(p.estimated).toContain('transit_times');
    const ride = p.legs.find((l) => l.kind === 'ride');
    expect(ride?.kind === 'ride' && ride.instruction).toMatch(
      /^Take the East Rail Line towards Admiralty · 4 stops/,
    );
  });

  it('says every terminus where branches share the track', () => {
    const CUHK = { lat: 22.4196, lng: 114.2068 };
    const ride = planMtrTrips(CITYU, CUHK)[0]!.legs.find((l) => l.kind === 'ride');
    expect(ride?.kind === 'ride' && ride.instruction).toMatch(
      /towards (Lo Wu \/ Lok Ma Chau|Lok Ma Chau \/ Lo Wu)/,
    );
  });

  it('nothing when both ends use the same station, or none is in reach', () => {
    expect(planMtrTrips(CITYU, { lat: 22.3372, lng: 114.1749 })).toEqual([]);
    expect(planMtrTrips({ lat: 22.21, lng: 114.03 }, CITYU)).toEqual([]); // open sea south of Lantau
  });
});

describe('transitTripFromPlan', () => {
  it('times the legs one after another, waits included, and validates', () => {
    const t = transitTripFromPlan(planMtrTrips(CITYU, ADMIRALTY)[0]!, AM);
    expect(TripOptionSchema.safeParse(t).success).toBe(true);
    expect(t.mode).toBe('transit');
    expect(t.transfers).toBe(0);
    expect(t.waiting_s).toBeGreaterThan(0);
    const walk = t.legs[0]!;
    const ride = t.legs[1]!;
    // The ride starts after the walk plus the wait at the platform.
    expect(new Date(ride.depart_at).getTime() - new Date(walk.arrive_at).getTime()).toBe(
      t.waiting_s * 1000,
    );
    expect(ride.color).toBe('#5EB6E4');
    expect(t.co2_g).toBeGreaterThan(0);
    expect(t.step_free).toBe('unconfirmed');
  });
});

describe('withWalkLegs (our walk to the station)', () => {
  const plan: TransitPlan = {
    id: 'test',
    fare_hkd: 5,
    source: 'mtr-open-data',
    estimated: ['transit_times'],
    legs: [
      {
        kind: 'walk',
        duration_s: 600,
        distance_m: 700,
        geometry: [at(-5, 0), at(205, 0)],
        instructions: [],
      },
      {
        kind: 'ride',
        vehicle: 'rail',
        operator: 'MTR',
        line: 'Kwun Tong Line',
        color: '#00A040',
        from_name: 'A',
        to_name: 'B',
        stops: 2,
        wait_s: 150,
        duration_s: 300,
        distance_m: 2000,
        geometry: [at(205, 0), at(2205, 0)],
        instruction: 'Take the Kwun Tong Line',
        realtime: false,
      },
    ],
  };

  it('swaps in the computed walk, re-times the ride and adopts its cover facts', () => {
    const walk = planSmartRoutes(twoWayGraph(), {
      origin: at(-5, 0),
      destination: at(205, 0),
      profile: 'sheltered',
      departure: AM,
      condition: 'rain',
      conditionSource: 'given',
    }).options[0]!;
    const before = transitTripFromPlan(plan, AM);
    const after = withWalkLegs(before, new Map([[0, walk]]));
    expect(after.legs[0]!.geometry).toEqual(walk.coordinates);
    expect(after.walking_s).toBe(Math.round(walk.duration_s));
    expect(after.total_s).toBe(Math.round(walk.duration_s + 150 + 300));
    // The ride still waits 150 s after the (new) walk.
    expect(
      new Date(after.legs[1]!.depart_at).getTime() - new Date(after.legs[0]!.arrive_at).getTime(),
    ).toBe(150_000);
    expect(after.uncovered_pct).toBe(100 - walk.pct_covered);
    expect(TripOptionSchema.safeParse(after).success).toBe(true);
  });

  it('cover stays unknown when only some walking legs are ours', () => {
    const twoWalks: TransitPlan = {
      ...plan,
      legs: [
        ...plan.legs,
        {
          kind: 'walk',
          duration_s: 300,
          distance_m: 350,
          geometry: [at(2205, 0), at(2400, 0)],
          instructions: [],
        },
      ],
    };
    const walk = planSmartRoutes(twoWayGraph(), {
      origin: at(-5, 0),
      destination: at(205, 0),
      profile: 'sheltered',
      departure: AM,
      condition: 'rain',
      conditionSource: 'given',
    }).options[0]!;
    const after = withWalkLegs(transitTripFromPlan(twoWalks, AM), new Map([[0, walk]]));
    expect(after.uncovered_pct).toBeNull();
    expect(after.sun_exposed_pct).toBeNull();
    expect(after.legs[0]!.geometry).toEqual(walk.coordinates); // the walk is still swapped in
  });

  it('leaves the trip alone when the index is not a walk', () => {
    const before = transitTripFromPlan(plan, AM);
    expect(withWalkLegs(before, new Map())).toBe(before);
  });
});
