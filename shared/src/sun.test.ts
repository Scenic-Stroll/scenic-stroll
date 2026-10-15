import { describe, expect, it } from 'vitest';

import { DEMO_CENTER } from './presets.ts';
import { sunPosition } from './sun.ts';

const at = (iso: string) => sunPosition(new Date(iso), DEMO_CENTER.lat, DEMO_CENTER.lng);

describe('sunPosition (Kowloon Tong)', () => {
  it('is almost straight overhead at solar noon on the June solstice (HK is near the tropic)', () => {
    // Solar noon in HK is about 12:25 local = 04:25 UTC.
    expect(at('2026-06-21T04:25:00Z').altitude_deg).toBeGreaterThan(85);
  });

  it('is low in the south at noon on the December solstice', () => {
    const p = at('2026-12-21T04:25:00Z');
    // 90° − (22.34° latitude + 23.44° tilt) ≈ 44°
    expect(p.altitude_deg).toBeGreaterThan(42);
    expect(p.altitude_deg).toBeLessThan(46);
    expect(p.azimuth_deg).toBeGreaterThan(170);
    expect(p.azimuth_deg).toBeLessThan(190);
  });

  it('is in the east in the morning and below the horizon at midnight', () => {
    const morning = at('2026-10-16T00:00:00Z'); // 08:00 HK time
    expect(morning.altitude_deg).toBeGreaterThan(0);
    expect(morning.azimuth_deg).toBeGreaterThan(90);
    expect(morning.azimuth_deg).toBeLessThan(135);
    expect(at('2026-10-16T16:00:00Z').altitude_deg).toBeLessThan(0); // midnight HK time
  });
});
