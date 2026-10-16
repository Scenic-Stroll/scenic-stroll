import { describe, expect, it } from 'vitest';

import {
  applyFeedback,
  aspectForProfile,
  FEEDBACK_QUESTIONS,
  feedbackScore,
  isDisputed,
} from './edge-feedback.ts';
import { parseGraphExport } from './graph-export.ts';
import { prepareGraph } from './router.ts';
import { edgeCost } from './routing-profiles.ts';
import { at, testGraph } from './routing-test-graph.ts';
import { planSmartRoutes } from './smart-route.ts';

const coveredEdge = () =>
  testGraph(
    [
      [0, 0],
      [100, 0],
    ],
    [{ from: 0, to: 1, covered: true, name_en: 'Covered walkway' }],
  ).edges[0]!;

describe('which question to ask', () => {
  it('matches the promise of the route', () => {
    expect(FEEDBACK_QUESTIONS[aspectForProfile('sheltered')]).toBe(
      'Was this route sheltered as promised?',
    );
    expect(aspectForProfile('cool')).toBe('shade');
    expect(aspectForProfile('step_free')).toBe('step_free');
    expect(aspectForProfile('fastest')).toBe('overall');
  });
});

describe('score and dispute', () => {
  it('one vote nudges a little, many agreeing votes more', () => {
    expect(feedbackScore([1, 0, 0])).toBeCloseTo(1 / 3);
    expect(feedbackScore([10, 0, 0])).toBeCloseTo(10 / 12);
    expect(feedbackScore([0, 0, 1])).toBeCloseTo(-1 / 3);
    expect(feedbackScore([2, 1, 2])).toBe(0);
  });

  it('needs 3 people against (Partly = half), and twice as many as for', () => {
    expect(isDisputed([0, 0, 2])).toBe(false);
    expect(isDisputed([0, 0, 3])).toBe(true);
    expect(isDisputed([0, 2, 2])).toBe(true); // 2 + 1
    expect(isDisputed([2, 0, 3])).toBe(false); // 3 < 2 × 2
  });
});

describe('applyFeedback', () => {
  it('a disputed cover is no longer treated as covered', () => {
    const e = applyFeedback(coveredEdge(), { shelter: [0, 0, 3] });
    expect(e.covered).toBe(false);
    expect(e.disputed).toEqual(['shelter']);
  });

  it('indoors stays indoors; shade becomes unknown; step-free becomes unconfirmed, never upgraded', () => {
    const indoor = applyFeedback(
      { ...coveredEdge(), indoor: true, shade: [50, 60] },
      { shelter: [0, 0, 5], shade: [0, 0, 5], step_free: [0, 0, 4] },
    );
    expect(indoor.covered).toBe(true);
    expect(indoor.shade).toBeNull();
    expect(indoor.step_free).toBe('unknown');
    const unknown = applyFeedback(
      { ...coveredEdge(), step_free: 'unknown' },
      { step_free: [9, 0, 0] },
    );
    expect(unknown.step_free).toBe('unknown');
  });

  it('nothing changes without feedback', () => {
    const e = coveredEdge();
    expect(applyFeedback(e, null)).toBe(e);
  });
});

describe('feedback in routing', () => {
  it('👍 makes a path a little cheaper for routes with that promise only', () => {
    const plain = coveredEdge();
    const liked = applyFeedback(plain, { shelter: [8, 0, 0] });
    expect(edgeCost(liked, 'sheltered')!).toBeLessThan(edgeCost(plain, 'sheltered')!);
    expect(edgeCost(liked, 'shaded')).toBe(edgeCost(plain, 'shaded')); // different promise
    expect(edgeCost(liked, 'fastest')).toBe(edgeCost(plain, 'fastest')); // fastest ignores it
  });

  it('a disputed cover sends the sheltered route the other way', () => {
    // Two ways from A to B: north (open, 200 m) and south (covered, 260 m).
    const g = testGraph(
      [
        [0, 0],
        [100, 50],
        [100, -95],
        [200, 0],
      ],
      [
        { from: 0, to: 1 },
        { from: 1, to: 3 },
        { from: 0, to: 2, covered: true },
        { from: 2, to: 3, covered: true },
      ],
    );
    const input = {
      origin: at(-5, 0),
      destination: at(205, 0),
      profile: 'sheltered' as const,
      departure: new Date('2026-10-16T12:00:00+08:00'),
      condition: 'rain' as const,
      conditionSource: 'given' as const,
    };
    const before = planSmartRoutes(g, input).options[0]!;
    expect(before.edge_ids).toEqual([2, 3]);

    // Three walkers said the "cover" isn't one: now the open north way is as good and shorter.
    const corrected = prepareGraph({
      ...g,
      edges: g.edges.map((e) => (e.covered ? applyFeedback(e, { shelter: [0, 0, 3] }) : e)),
    });
    expect(planSmartRoutes(corrected, input).options[0]!.edge_ids).toEqual([0, 1]);

    // Liked instead: the route keeps the covered way and lists walker feedback as a source.
    const liked = prepareGraph({
      ...g,
      edges: g.edges.map((e) => (e.covered ? applyFeedback(e, { shelter: [4, 0, 0] }) : e)),
    });
    const kept = planSmartRoutes(liked, input).options[0]!;
    expect(kept.edge_ids).toEqual([2, 3]);
    expect(kept.data_sources).toContain('walker_feedback');
  });

  it('the graph export carries feedback (field 23) and parsing applies it', () => {
    const g = parseGraphExport({
      build_id: 1,
      source: 'test',
      version: 'v',
      nodes: [
        [0, 114.17, 22.335, 10, 'street'],
        [1, 114.171, 22.335, 10, 'street'],
      ],
      edges: [
        [
          7,
          0,
          1,
          100,
          'footway',
          true,
          false,
          false,
          'yes',
          0,
          10,
          10,
          0,
          null,
          0.9,
          true,
          null,
          null,
          '_ibE_seK_seK_seK',
          'lands_3dpn',
          null,
          null,
          null,
          { shelter: [0, 1, 3] },
        ],
      ],
    });
    expect(g.edges[0]!.covered).toBe(false);
    expect(g.edges[0]!.disputed).toEqual(['shelter']);
  });
});
