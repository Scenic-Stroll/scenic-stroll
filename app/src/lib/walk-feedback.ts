/**
 * The end of a walk (smart routing step 7): the one-question feedback ("Was it sheltered as
 * promised?") and "Save as a community route".
 */
import {
  aspectForProfile,
  buildPlannedRouteUpload,
  type FeedbackVerdict,
  type PlannedWalk,
} from '@scenic/shared';

import { communityKeys } from '@/lib/community-routes';
import type { FollowSession } from '@/lib/follow-store';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';

/** The line and edges of the whole walk, including the parts before any re-plan. */
export function walkedRoute(s: FollowSession) {
  return {
    line: [...s.walkedBefore.line, ...s.route.coordinates],
    edgeIds: [...new Set([...s.walkedBefore.edgeIds, ...s.route.edgeIds])],
  };
}

/** Can we ask about this walk? Only computed routes make promises about their paths. */
export function canAskFeedback(s: FollowSession): boolean {
  return s.route.profile !== null && s.route.buildId !== null && walkedRoute(s).edgeIds.length > 0;
}

/**
 * Sends the answer. Returns how many paths got a vote (0 for a demo walk: recorded, not counted).
 * Answering again for the same walk replaces the earlier answer.
 */
export async function submitWalkFeedback(
  s: FollowSession,
  verdict: FeedbackVerdict,
  simulated: boolean,
): Promise<number> {
  if (!s.route.profile || s.route.buildId === null)
    throw new Error('Nothing to rate on this route.');
  const { data, error } = await supabase.rpc('submit_walk_feedback', {
    p_walk_id: s.walkId,
    p_build_id: s.route.buildId,
    p_edge_ids: walkedRoute(s).edgeIds,
    p_profile: s.route.profile,
    p_aspect: aspectForProfile(s.route.profile),
    p_verdict: verdict,
    p_simulated: simulated,
  });
  if (error) {
    if (/out of date/.test(error.message))
      throw new Error('The walking map was updated meanwhile.');
    if (/Too many/.test(error.message)) throw new Error('Too many answers — try again later.');
    throw new Error('Couldn’t send your answer — check your connection.');
  }
  return (data as number) ?? 0;
}

/** Saves the walk as an (unverified) community route; it then shows on the map for others. */
export async function savePlannedRoute(walk: PlannedWalk): Promise<void> {
  const built = buildPlannedRouteUpload(walk);
  if (!built.ok) throw new Error(built.error);
  const { error } = await supabase.rpc('create_route', { payload: built.upload });
  if (error) {
    if (/row-level security/.test(error.message)) {
      throw new Error('You’ve saved a lot of routes this hour — try again later.');
    }
    throw new Error('Couldn’t save the route — check your connection.');
  }
  await queryClient.invalidateQueries({ queryKey: communityKeys.all });
}
