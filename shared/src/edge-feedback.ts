/**
 * Walkers' feedback on computed routes (smart routing step 7), and what it does to routing.
 *
 * After a computed walk the app asks ONE question that matches the route's promise ("Was it
 * sheltered as promised?" for a sheltered route). The answer is a vote on each relevant path; the
 * database keeps one vote per person per path (public.edge_feedback has the counts).
 *
 * Two effects, both deliberately small and slow:
 *   1. score — a nudge of at most ±20 % on the path's cost for routes that care about that aspect
 *      (routing-profiles.ts, the "community" weight). (👍 − 👎) / (votes + 2), so one vote moves
 *      it a little and many agreeing votes move it more.
 *   2. dispute — once at least 3 people (Partly counts half) say no, and twice as many as say yes,
 *      the map is treated as wrong: "covered" becomes not covered, shade becomes unknown, and
 *      "step-free" becomes unconfirmed. Feedback never upgrades anything to step-free — that stays
 *      a promise only the map data can make.
 */
import type { RoutingEdge } from './graph-export.ts';
import type { RoutingProfile } from './routing-profiles.ts';

/** What a question is about. Same list as the CHECK in the walk_feedback migration. */
export const FEEDBACK_ASPECTS = ['shelter', 'shade', 'step_free', 'overall'] as const;
export type FeedbackAspect = (typeof FEEDBACK_ASPECTS)[number];

export const FEEDBACK_VERDICTS = ['yes', 'partly', 'no'] as const;
export type FeedbackVerdict = (typeof FEEDBACK_VERDICTS)[number];

/** Which promise a route made, so which question to ask and which score its cost uses. */
export function aspectForProfile(profile: RoutingProfile): FeedbackAspect {
  switch (profile) {
    case 'sheltered':
      return 'shelter';
    case 'shaded':
    case 'cool':
      return 'shade';
    case 'step_free':
      return 'step_free';
    default:
      return 'overall';
  }
}

export const FEEDBACK_QUESTIONS: Record<FeedbackAspect, string> = {
  shelter: 'Was this route sheltered as promised?',
  shade: 'Was it shaded as promised?',
  step_free: 'Was it really step-free?',
  overall: 'Was the route as described?',
};

/** Counts for one path and aspect, as the graph export sends them: [👍, Partly, 👎]. */
export type FeedbackCounts = [ups: number, partly: number, downs: number];
export type EdgeFeedback = Partial<Record<FeedbackAspect, FeedbackCounts>>;

/** −1…1: how much walkers agree the path keeps this promise. 0 = no votes. */
export function feedbackScore([ups, partly, downs]: FeedbackCounts): number {
  return (ups - downs) / (ups + partly + downs + 2);
}

/** At least this many people must disagree before the map is overruled. */
export const DISPUTE_MIN_VOTES = 3;

/** Enough walkers say the map is wrong about this (see the file comment). */
export function isDisputed([ups, partly, downs]: FeedbackCounts): boolean {
  const against = downs + partly / 2;
  return against >= DISPUTE_MIN_VOTES && against >= 2 * ups;
}

/** One edge with its feedback applied: scores attached, disputed attributes overruled. */
export function applyFeedback(edge: RoutingEdge, fb: EdgeFeedback | null | undefined): RoutingEdge {
  if (!fb) return edge;
  const community: Partial<Record<FeedbackAspect, number>> = {};
  const disputed: FeedbackAspect[] = [];
  for (const aspect of FEEDBACK_ASPECTS) {
    const counts = fb[aspect];
    if (!counts) continue;
    community[aspect] = feedbackScore(counts);
    if (isDisputed(counts)) disputed.push(aspect);
  }
  const e = { ...edge, community, disputed };
  // Indoors is indoors: only a cover (canopy, footbridge roof) can turn out not to be one.
  if (disputed.includes('shelter') && e.covered && !e.indoor) e.covered = false;
  if (disputed.includes('shade')) e.shade = null;
  if (disputed.includes('step_free') && e.step_free === 'yes') e.step_free = 'unknown';
  return e;
}
