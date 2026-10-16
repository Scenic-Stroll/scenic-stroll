import { describe, expect, it } from 'vitest';

import {
  conditionChangeMessage,
  locateOnRoute,
  missedClosing,
  OFF_ROUTE_S,
  pointAlong,
  remainingSeconds,
  reportHitsRoute,
  sameEdges,
  stepIndexAt,
  trackOffRoute,
} from './follow.ts';
import { at } from './routing-test-graph.ts';

// An L-shaped route: 200 m east, then 100 m north.
const LINE = [at(0, 0), at(200, 0), at(200, 100)];

describe('locateOnRoute / pointAlong', () => {
  it('finds how far along and how far off the route a point is', () => {
    const p = locateOnRoute(LINE, at(50, 30));
    expect(p.alongM).toBeCloseTo(50, 0);
    expect(p.distM).toBeCloseTo(30, 0);
    expect(p.totalM).toBeCloseTo(300, 0);
    expect(locateOnRoute(LINE, at(230, 60)).alongM).toBeCloseTo(260, 0);
  });

  it('walks along the line, and can step sideways (left of travel)', () => {
    const p = pointAlong(LINE, 250);
    expect(locateOnRoute(LINE, p).alongM).toBeCloseTo(250, 0);
    const left = locateOnRoute(LINE, pointAlong(LINE, 100, 60));
    expect(left.distM).toBeCloseTo(60, 0);
    expect(left.alongM).toBeCloseTo(100, 0);
    // Past the end stays at the end.
    expect(locateOnRoute(LINE, pointAlong(LINE, 999)).alongM).toBeCloseTo(300, 0);
  });
});

describe('trackOffRoute', () => {
  it(`re-plans only after more than 40 m for ${OFF_ROUTE_S} s`, () => {
    let s = trackOffRoute({ since: null }, { distM: 60, accuracyM: 10, atMs: 0 });
    expect(s.replan).toBe(false);
    s = trackOffRoute(s.state, { distM: 60, accuracyM: 10, atMs: 19_000 });
    expect(s.replan).toBe(false);
    expect(s.secondsOff).toBe(19);
    s = trackOffRoute(s.state, { distM: 60, accuracyM: 10, atMs: 20_000 });
    expect(s.replan).toBe(true);
  });

  it('coming back on route resets the clock', () => {
    let s = trackOffRoute({ since: null }, { distM: 60, accuracyM: 10, atMs: 0 });
    s = trackOffRoute(s.state, { distM: 10, accuracyM: 10, atMs: 15_000 });
    expect(s.state.since).toBeNull();
    s = trackOffRoute(s.state, { distM: 60, accuracyM: 10, atMs: 30_000 });
    expect(s.replan).toBe(false);
  });

  it('ignores inaccurate fixes (indoor GPS)', () => {
    const s = trackOffRoute({ since: null }, { distM: 120, accuracyM: 90, atMs: 0 });
    expect(s.state.since).toBeNull();
    expect(s.replan).toBe(false);
  });
});

describe('steps and time left', () => {
  const steps = [{ distance_m: 100 }, { distance_m: 150 }, { distance_m: 50 }, { distance_m: 0 }];
  it('picks the step you are on', () => {
    expect(stepIndexAt(steps, 0)).toBe(0);
    expect(stepIndexAt(steps, 120)).toBe(1);
    expect(stepIndexAt(steps, 299)).toBe(2);
    expect(stepIndexAt(steps, 300)).toBe(3); // "Arrive"
  });
  it('scales the planned time by what is left', () => {
    expect(remainingSeconds(300, { distM: 0, alongM: 100, totalM: 300 })).toBeCloseTo(200);
  });
});

describe('reportHitsRoute', () => {
  const route = { line: LINE, edgeIds: [7, 8, 9] };
  it('a report on one of my edges, ahead of me, counts', () => {
    expect(reportHitsRoute({ edge_id: 9, point: at(200, 50) }, route, 100)).toBe(true);
  });
  it('one behind me, or on an edge I do not use, does not', () => {
    expect(reportHitsRoute({ edge_id: 7, point: at(20, 0) }, route, 150)).toBe(false);
    expect(reportHitsRoute({ edge_id: 42, point: at(200, 50) }, route, 0)).toBe(false);
  });
  it('the standard route (no edge ids) goes by distance from the line', () => {
    const standard = { line: LINE, edgeIds: [] };
    expect(reportHitsRoute({ edge_id: 1, point: at(200, 50) }, standard, 0)).toBe(true);
    expect(reportHitsRoute({ edge_id: 1, point: at(150, 60) }, standard, 0)).toBe(false);
  });
});

describe('missedClosing', () => {
  const closing = [
    {
      name: 'Festival Walk LG1',
      closes_at: '2026-10-16T14:00:00.000Z', // 22:00 HK
      reach_at: '2026-10-16T13:52:00.000Z',
      point: at(200, 0),
    },
  ];
  it('flags a link you can no longer reach in time', () => {
    // 200 m to go at 1.3 m/s ≈ 2.5 min; at 21:56 you'd arrive 21:58:30 — inside the 2-min margin.
    expect(missedClosing(closing, LINE, 0, new Date('2026-10-16T21:56:00+08:00'))).not.toBeNull();
    expect(missedClosing(closing, LINE, 0, new Date('2026-10-16T21:50:00+08:00'))).toBeNull();
  });
  it('ignores a link you have already passed', () => {
    expect(missedClosing(closing, LINE, 260, new Date('2026-10-16T21:59:00+08:00'))).toBeNull();
  });
});

describe('sameEdges', () => {
  it('more than 80 % shared = same', () => {
    expect(sameEdges([1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6])).toBe(true);
    expect(sameEdges([1, 2, 3, 4, 5], [1, 2, 3, 9, 8])).toBe(false);
    expect(sameEdges([], [1])).toBe(false);
  });
});

describe('conditionChangeMessage', () => {
  it('offers the sheltered route with how much longer it is', () => {
    const m = conditionChangeMessage({
      from: 'normal',
      to: 'rain',
      candidate: { profile: 'sheltered', duration_s: 420, viaIndoor: 'Festival Walk LG1' },
      remainingS: 300,
      same: false,
    });
    expect(m.text).toBe(
      'It’s started raining — a sheltered route via Festival Walk LG1 adds 2 min. Switch?',
    );
    expect(m.offerSwitch).toBe(true);
  });

  it('says so when you are already on the right route, or nothing better exists', () => {
    const same = conditionChangeMessage({
      from: 'normal',
      to: 'heat',
      candidate: { profile: 'cool', duration_s: 300, viaIndoor: null },
      remainingS: 300,
      same: true,
    });
    expect(same.offerSwitch).toBe(false);
    expect(same.text).toMatch(/already on the best route/);
    const none = conditionChangeMessage({
      from: 'rain',
      to: 'normal',
      candidate: null,
      remainingS: 300,
      same: false,
    });
    expect(none.text).toMatch(/^The rain has stopped/);
  });

  it('a quicker route "saves" time', () => {
    const m = conditionChangeMessage({
      from: 'rain',
      to: 'normal',
      candidate: { profile: 'balanced', duration_s: 120, viaIndoor: null },
      remainingS: 300,
      same: false,
    });
    expect(m.text).toBe('The rain has stopped — a different route saves 3 min. Switch?');
  });
});
