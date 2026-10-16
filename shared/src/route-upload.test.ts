import { describe, expect, it } from 'vitest';

import type { GpsSample } from './gps.ts';
import { buildPlannedRouteUpload, buildRouteUpload, type LocalRecording } from './route-upload.ts';

const START = { lat: 22.336961, lng: 114.175531 };
const T0 = 1_760_000_000_000;

/** A straight walk north: one sample every 2.5 s at 1.4 m/s (3.5 m apart). */
function walk(count: number): GpsSample[] {
  return Array.from({ length: count }, (_, i) => ({
    lat: START.lat + (i * 3.5) / 110_540,
    lng: START.lng,
    accuracy: 5,
    timestamp: T0 + i * 2500,
  }));
}

function recording(overrides: Partial<LocalRecording> = {}): LocalRecording {
  return {
    id: '5b0c5d4e-6f1a-4b2c-9d3e-8f7a6b5c4d3e',
    title: 'Exit C1 to YEUNG',
    startLabel: 'Kowloon Tong Exit C1',
    endLabel: '  ',
    description: '由港鐵C出口行入又一城，搭𨋢上L2',
    showAuthor: false,
    trimEnds: false,
    samples: walk(100), // ≈ 346 m, 247.5 s
    checkpoints: [],
    ...overrides,
  };
}

describe('buildRouteUpload', () => {
  it('builds a valid payload from a normal walk', () => {
    const result = buildRouteUpload(recording());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.upload.duration_s).toBe(248); // 247.5 s rounded
    expect(result.upload.line.length).toBe(2); // straight line simplifies to two points
    expect(result.upload.end_label).toBeNull(); // blank label → null
  });

  it('never uploads timestamps or accuracy (raw trace stays on the phone)', () => {
    const result = buildRouteUpload(recording());
    if (!result.ok) throw new Error(result.error);
    for (const point of result.upload.line) {
      expect(Object.keys(point).sort()).toEqual(['lat', 'lng']);
    }
  });

  it('trims the ends when asked and drops checkpoints in the trimmed part', () => {
    const samples = walk(100);
    const result = buildRouteUpload(
      recording({
        trimEnds: true,
        checkpoints: [
          // At the very start (inside the trimmed 50 m) → must be dropped.
          {
            kind: 'entrance',
            lat: START.lat,
            lng: START.lng,
            floorFrom: null,
            floorTo: null,
            note: null,
            timestamp: samples[1]!.timestamp,
          },
          // In the middle → kept.
          {
            kind: 'lift',
            lat: samples[50]!.lat,
            lng: START.lng,
            floorFrom: 'G',
            floorTo: 'L2',
            note: ' ',
            timestamp: samples[50]!.timestamp,
          },
        ],
      }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.upload.checkpoints).toHaveLength(1);
    expect(result.upload.checkpoints[0]).toMatchObject({
      seq: 1,
      kind: 'lift',
      floor_from: 'G',
      floor_to: 'L2',
      note: null,
    });
    expect(result.upload.line[0]!.lat).toBeGreaterThan(START.lat + 49 / 110_540);
  });

  it('numbers checkpoints in walking order even if saved out of order', () => {
    const samples = walk(100);
    const cp = (kind: 'lift' | 'stairs', i: number) => ({
      kind,
      lat: samples[i]!.lat,
      lng: START.lng,
      floorFrom: null,
      floorTo: null,
      note: null,
      timestamp: samples[i]!.timestamp,
    });
    const result = buildRouteUpload(recording({ checkpoints: [cp('stairs', 70), cp('lift', 30)] }));
    if (!result.ok) throw new Error(result.error);
    expect(result.upload.checkpoints.map((c) => [c.seq, c.kind])).toEqual([
      [1, 'lift'],
      [2, 'stairs'],
    ]);
  });

  it('refuses to trim a route that is too short', () => {
    const result = buildRouteUpload(recording({ trimEnds: true, samples: walk(20) }));
    expect(result).toEqual({ ok: false, error: expect.stringContaining('too short') });
  });

  it('refuses a recording with fewer than two usable points', () => {
    const result = buildRouteUpload(recording({ samples: walk(1) }));
    expect(result.ok).toBe(false);
  });

  it('rejects an empty title', () => {
    const result = buildRouteUpload(recording({ title: '   ' }));
    expect(result.ok).toBe(false);
  });
});

describe('buildPlannedRouteUpload (save a walked computed route)', () => {
  const walkDone = {
    id: '6b0d3c1e-8a4f-4e2b-9c1d-2f3a4b5c6d7e',
    title: '  Exit A1 to MMW (sheltered)  ',
    startLabel: 'Kowloon Tong Exit A1',
    endLabel: '',
    description: null,
    showAuthor: false,
    line: [START, { lat: 22.3365, lng: 114.1745 }, { lat: 22.3354, lng: 114.1728 }],
    durationS: 540.4,
    markers: [{ kind: 'lift' as const, point: { lat: 22.3365, lng: 114.1745 } }],
  };

  it('is marked "planned", with stairs/lifts as checkpoints and blank labels dropped', () => {
    const r = buildPlannedRouteUpload(walkDone);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.upload.origin).toBe('planned');
    expect(r.upload.title).toBe('Exit A1 to MMW (sheltered)');
    expect(r.upload.end_label).toBeNull();
    expect(r.upload.duration_s).toBe(540);
    expect(r.upload.checkpoints).toEqual([
      {
        seq: 1,
        kind: 'lift',
        point: walkDone.markers[0]!.point,
        floor_from: null,
        floor_to: null,
        note: null,
      },
    ]);
  });

  it('an empty title is refused', () => {
    expect(buildPlannedRouteUpload({ ...walkDone, title: ' ' }).ok).toBe(false);
  });
});
