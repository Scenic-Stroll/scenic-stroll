import { describe, expect, it } from 'vitest';

import { co2Grams } from './emissions.ts';
import { at, twoWayGraph } from './routing-test-graph.ts';
import { planSmartRoutes } from './smart-route.ts';
import {
  bestForYouScore,
  carTripsFromDrive,
  rankTrips,
  sortTrips,
  walkTripFromSmart,
  walkTripFromStandard,
  type DriveRoute,
} from './trip-plan.ts';
import { PlanTripResponseSchema, TripOptionSchema } from './trip-schema.ts';

const NOON = new Date('2026-10-24T12:00:00+08:00');
const LINE = [at(0, 0), at(200, 0)];

const drive = (o: Partial<DriveRoute> = {}): DriveRoute => ({
  distance_m: 2000,
  duration_s: 300,
  typical_s: 240,
  coordinates: LINE,
  segments: [{ from: 0, to: 1, level: 'slow' }],
  description: 'Waterloo Rd',
  steps: [],
  live: true,
  ...o,
});

const walk = (seconds: number) =>
  walkTripFromStandard(
    {
      provider: 'ors',
      distance_m: seconds * 1.3,
      duration_s: seconds,
      coordinates: LINE,
      steps: [],
    },
    NOON,
  );

describe('emissions', () => {
  it('car ≈ 164.5 g per km, walking 0', () => {
    expect(co2Grams('car', 2000)).toBe(329);
    expect(co2Grams('walk', 2000)).toBe(0);
  });
});

describe('normalising each mode', () => {
  it('a computed walk keeps its cover, sun and step-free facts', () => {
    const res = planSmartRoutes(twoWayGraph(), {
      origin: at(-5, 0),
      destination: at(205, 0),
      profile: 'sheltered',
      departure: NOON,
      condition: 'rain',
      conditionSource: 'given',
    });
    const t = walkTripFromSmart(res.options[0]!, NOON);
    expect(TripOptionSchema.safeParse(t).success).toBe(true);
    expect(t.mode).toBe('walk');
    expect(t.co2_g).toBe(0);
    expect(t.uncovered_pct).toBe(100 - res.options[0]!.pct_covered);
    expect(t.title).toBe('Walk · Sheltered');
  });

  it('a car route reports traffic delay vs a typical day, and is never "step-free: yes"', () => {
    const [car] = carTripsFromDrive([drive()], NOON, 'google');
    expect(TripOptionSchema.safeParse(car).success).toBe(true);
    expect(car!.traffic).toEqual({ delay_s: 60, live: true, avoids: null });
    expect(car!.step_free).toBe('unconfirmed');
    expect(car!.title).toBe('Car via Waterloo Rd');
    expect(car!.co2_g).toBe(329);
    expect(car!.cost_hkd).toBeNull();
  });

  it('without live traffic the delay is unknown and the time is marked estimated', () => {
    const [car] = carTripsFromDrive([drive({ live: false, typical_s: null })], NOON, 'ors');
    expect(car!.traffic?.delay_s).toBeNull();
    expect(car!.estimated).toContain('traffic');
  });
});

describe('labels and the green nudge', () => {
  it('walking within 5 min of the car is recommended, with the CO₂ saved', () => {
    const ranked = rankTrips(
      [walk(480), ...carTripsFromDrive([drive()], NOON, 'google')],
      'normal',
    );
    const w = ranked.find((o) => o.mode === 'walk')!;
    expect(w.recommended).toBe(true);
    expect(w.nudge).toBe('Only 3 min slower than driving · saves ~329 g CO₂');
    expect(w.labels).toEqual(expect.arrayContaining(['greenest', 'cheapest']));
    expect(ranked.find((o) => o.mode === 'car')!.labels).toContain('fastest');
  });

  it('no nudge when walking is much slower', () => {
    const ranked = rankTrips(
      [walk(1500), ...carTripsFromDrive([drive()], NOON, 'google')],
      'normal',
    );
    expect(ranked.find((o) => o.mode === 'walk')!.recommended).toBe(false);
  });

  it('"as quick as driving" when within 30 s', () => {
    const ranked = rankTrips(
      [walk(310), ...carTripsFromDrive([drive()], NOON, 'google')],
      'normal',
    );
    expect(ranked.find((o) => o.mode === 'walk')!.nudge).toMatch(/^As quick as driving/);
  });

  it('the quicker car route "avoids traffic" when another is clearly slower now', () => {
    const cars = carTripsFromDrive(
      [drive({ duration_s: 300 }), drive({ duration_s: 660, description: 'Boundary St' })],
      NOON,
      'google',
    );
    const best = rankTrips(cars, 'normal').find((o) => o.labels.includes('avoids_traffic'))!;
    expect(best.total_s).toBe(300);
    expect(best.traffic?.avoids).toBe('Avoids traffic: saves 6 min vs the route via Boundary St');
  });

  it('the whole response validates', () => {
    const options = rankTrips([walk(480), ...carTripsFromDrive([drive()], NOON, 'google')], 'rain');
    const res = {
      options,
      unavailable: [],
      condition: 'rain',
      data_freshness: { traffic_at: null },
    };
    expect(PlanTripResponseSchema.safeParse(res).success).toBe(true);
  });
});

describe('sorting', () => {
  const options = () => [walk(480), ...carTripsFromDrive([drive()], NOON, 'google')];

  it('fastest / greenest / least walking', () => {
    expect(sortTrips(options(), 'fastest', 'normal')[0]!.mode).toBe('car');
    expect(sortTrips(options(), 'greenest', 'normal')[0]!.mode).toBe('walk');
    expect(sortTrips(options(), 'least_walking', 'normal')[0]!.mode).toBe('car');
  });

  it('best-for-you counts CO₂, and exposed walking in the rain', () => {
    const [w, c] = options();
    // 2 km by car adds ~66 s of "cost" for its CO₂.
    expect(bestForYouScore(c!, 'normal')).toBeCloseTo(300 + 0.2 * 329);
    // In rain, unknown cover counts as half exposed: 480 + 0.5 × 480 × 0.5.
    expect(bestForYouScore(w!, 'rain')).toBe(600);
    expect(bestForYouScore(w!, 'normal')).toBe(480);
  });
});
