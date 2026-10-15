/**
 * Community routes for the map, read from the public `routes_public` view.
 * Readable without signing in (RLS: routes are public; who created them is not).
 */
import { COMMUNITY_ROUTE_COLUMNS, parseCommunityRoutes, type CommunityRoute } from '@scenic/shared';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export const communityKeys = { all: ['community-routes'] as const };

/** Newest first; 200 is plenty for the demo area and keeps the map smooth. */
export async function fetchCommunityRoutes(): Promise<CommunityRoute[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('routes_public')
    .select(COMMUNITY_ROUTE_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    console.warn('[routes_public]', error);
    throw new Error('Couldn’t load community routes. Check your connection and try again.');
  }
  const { routes, skipped } = parseCommunityRoutes(data);
  if (skipped > 0) console.warn(`[routes_public] skipped ${skipped} malformed row(s)`);
  return routes;
}
