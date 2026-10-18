import { describe, expect, it } from 'vitest';

import { RUSH_HOUR_FACTOR, withRushHour } from './rush-hour.ts';
import { taxiTripFromDrive } from './taxi-fare.ts';
import {
  carTripsFromDrive,
  rankTrips,
  walkTripFromStandard,
  type DriveRoute,
} from './trip-plan.ts';
import { PlanTripResponseSchema, type PlanTripResponse } from './trip-schema.ts';

const NOW = new Date('2026-10-24T18:00:00+08:00');
const LINE = [
  { lat: 22.3369, lng: 114.1778 },
  { lat: 22.3361, lng: 114.1741 },
];
// Exit A1 → CityU: a 13-minute walk; a 6-minute drive when roads are clear.
const drive: DriveRoute = {
  distance_m: 2350,
  duration_s: 360,
  typical_s: null,
  coordinates: LINE,
  segments: [],
  description: null,
  steps: [],
  live: false,
};
const walk = walkTripFromStandard(
  { provider: 'ors', distance_m: 950, duration_s: 780, coordinates: LINE },
  NOW,
);
const plan = (): PlanTripResponse => ({
  options: rankTrips(
    [walk, ...carTripsFromDrive([drive], NOW, 'ors'), taxiTripFromDrive([drive], NOW, 'ors')!],
    'normal',
  ),
  unavailable: [],
  condition: 'normal',
  data_freshness: { traffic_at: null, eta_at: null },
});

describe('simulated rush hour (demo)', () => {
  it('on a quiet road the car is fastest and walking gets no nudge', () => {
    const p = plan();
    expect(p.options.find((o) => o.labels.includes('fastest'))!.mode).toBe('car');
    expect(p.options.find((o) => o.mode === 'walk')!.recommended).toBe(false);
  });

  it('jams cars and taxis, re-prices the taxi, and walking becomes the nudge', () => {
    const p = withRushHour(plan());
    const car = p.options.find((o) => o.mode === 'car')!;
    const taxi = p.options.find((o) => o.mode === 'taxi')!;
    const walking = p.options.find((o) => o.mode === 'walk')!;
    expect(car.total_s).toBe(360 * RUSH_HOUR_FACTOR);
    expect(car.traffic).toMatchObject({ delay_s: 540, live: false });
    expect(car.estimated).toContain('simulated_traffic');
    expect(car.legs[0]!.traffic_segments).toEqual([{ from: 0, to: 1, level: 'jam' }]);
    expect(taxi.cost_range_hkd![1]).toBeGreaterThan(
      plan().options.find((o) => o.mode === 'taxi')!.cost_range_hkd![1],
    );
    expect(walking.labels).toContain('fastest');
    expect(walking.recommended).toBe(true);
    expect(walking.nudge).toMatch(/^As quick as driving · saves ~\d+ g CO₂$/);
    expect(PlanTripResponseSchema.safeParse(p).success).toBe(true);
  });

  it('leaves walking and transit times alone', () => {
    expect(withRushHour(plan()).options.find((o) => o.mode === 'walk')!.total_s).toBe(780);
  });
});
