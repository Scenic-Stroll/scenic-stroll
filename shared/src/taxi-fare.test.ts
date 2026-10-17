import { describe, expect, it } from 'vitest';

import { taxiFareRange, taxiMeterFare, taxiTripFromDrive, TAXI_PICKUP_S } from './taxi-fare.ts';
import type { DriveRoute } from './trip-plan.ts';
import { TripOptionSchema } from './trip-schema.ts';

const route = (over: Partial<DriveRoute> = {}): DriveRoute => ({
  distance_m: 5000,
  duration_s: 600,
  typical_s: null,
  coordinates: [
    { lat: 22.336, lng: 114.174 },
    { lat: 22.319, lng: 114.169 },
  ],
  segments: [],
  description: 'Waterloo Road',
  steps: [],
  live: false,
  ...over,
});

describe('urban taxi meter (tariff from 14 July 2024)', () => {
  it('charges the flag fall for the first 2 km', () => {
    expect(taxiMeterFare(1500)).toBe(29);
    expect(taxiMeterFare(2000)).toBe(29);
    expect(taxiMeterFare(2001)).toBe(31.1); // any part of 200 m is a jump
  });

  it('adds HK$2.1 per 200 m, and per minute waiting', () => {
    expect(taxiMeterFare(5000)).toBe(60.5); // 15 jumps
    expect(taxiMeterFare(5000, 4.2)).toBe(71); // + 5 minutes waiting
  });

  it('drops to HK$1.4 a jump once the fare reaches HK$102.5', () => {
    expect(taxiMeterFare(2000 + 35 * 200)).toBe(102.5);
    expect(taxiMeterFare(2000 + 36 * 200)).toBe(103.9);
    expect(taxiMeterFare(20_000)).toBe(179.5); // 35 × 2.1 + 55 × 1.4
  });
});

describe('taxi option', () => {
  it('gives a range: distance only, then with traffic waiting', () => {
    expect(taxiFareRange(route())).toEqual([60.5, 64.7]); // 15% of 10 min = 2 minutes waiting
    expect(taxiFareRange(route({ live: true, typical_s: 420 }))).toEqual([60.5, 66.8]); // 3 min delay
  });

  it('uses the quickest driving route, adds pickup time, and fits the trip schema', () => {
    const slow = route({ duration_s: 900, description: 'Nathan Road' });
    const trip = taxiTripFromDrive([slow, route()], new Date('2026-10-19T08:30:00+08:00'), 'ors')!;
    expect(trip.title).toBe('Taxi via Waterloo Road');
    expect(trip.total_s).toBe(600 + TAXI_PICKUP_S);
    expect(trip.cost_hkd).toBe(60.5);
    expect(trip.cost_range_hkd).toEqual([60.5, 64.7]);
    expect(trip.estimated).toContain('taxi_fare');
    expect(TripOptionSchema.safeParse(trip).success).toBe(true);
    expect(taxiTripFromDrive([], new Date(), 'ors')).toBeNull();
  });
});
