import { describe, expect, it } from 'vitest';

import { haversineMeters } from './geo.ts';
import { isInGraphArea, tripBbox } from './graph-area.ts';
import { DEMO_CENTER } from './presets.ts';

describe('graph area', () => {
  it('covers the demo centre and not Central', () => {
    expect(isInGraphArea(DEMO_CENTER)).toBe(true);
    expect(isInGraphArea({ lat: 22.2819, lng: 114.1582 })).toBe(false);
  });

  it('tripBbox grows the box around both points by the margin', () => {
    const a = { lat: 22.336961, lng: 114.175531 };
    const b = { lat: 22.335892, lng: 114.173197 };
    const box = tripBbox(a, b, 400);
    expect(box.minLat).toBeLessThan(Math.min(a.lat, b.lat));
    expect(box.maxLng).toBeGreaterThan(Math.max(a.lng, b.lng));
    // The margin is ~400 m on each side.
    const south = haversineMeters({ lat: box.minLat, lng: b.lng }, { lat: b.lat, lng: b.lng });
    const east = haversineMeters({ lat: a.lat, lng: box.maxLng }, a);
    expect(south).toBeGreaterThan(390);
    expect(south).toBeLessThan(410);
    expect(east).toBeGreaterThan(390);
    expect(east).toBeLessThan(410);
  });
});
