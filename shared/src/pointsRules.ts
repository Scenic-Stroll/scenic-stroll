/**
 * ALL points rules in one place (D55) — change the numbers here, nowhere else. The server
 * (award-points) and the app both read this file; tests in points.test.ts show what each rule
 * means. Points can't be bought, cashed out or transferred: nothing in the app does that.
 */
export const POINTS_RULES = {
  /** 0.75 km of walking counts as 1,000 steps. */
  metersPer1000Steps: 750,

  /**
   * Distance points per day (Hong Kong time), from recorded walks only. Each band pays for the
   * steps that fall inside it; partial thousands count in proportion; the day's total is rounded
   * down. 0–6,000 steps: 25 per 1,000 · 6,000–8,000: 50 per 1,000 · 8,000–10,000: 100 per 1,000.
   */
  distanceTiers: [
    { fromSteps: 0, toSteps: 6000, pointsPer1000Steps: 25 },
    { fromSteps: 6000, toSteps: 8000, pointsPer1000Steps: 50 },
    { fromSteps: 8000, toSteps: 10000, pointsPer1000Steps: 100 },
  ],
  /** Most distance points in one day. */
  dailyMaxDistancePoints: 450,
  /** The daily ring on Profile: steps today out of this. */
  dailyStepGoal: 10000,

  /**
   * Speed check: stretches faster than walking or wheeling earn nothing. A stretch is too fast when
   * the average speed over at least this many seconds is above this many km/h (a short jog to
   * catch a light doesn't count; a bus ride does). Wheelchair users earn the same by distance.
   */
  maxSpeedKmh: 7,
  speedWindowSeconds: 30,

  /** Reading a collected pin, once per pin, if the reader stayed open long enough. */
  pinRead: {
    amount: 20, // TBD: team to decide
    minReadSeconds: 10,
  },

  /** Finishing a topic board (Explore) — not wired up yet. */
  boardDone: { amount: 0 }, // TBD: team to decide
  /** Contributions (e.g. an approved recorded route) — not wired up yet. */
  contribution: { amount: 0 }, // TBD: team to decide

  /** Days are counted in Hong Kong time (UTC+8, no daylight saving). */
  utcOffsetHours: 8,
} as const;
