/**
 * Smart routes for the planning sheet: our own computed routes from the `smart-route` function.
 * Never shows an error: if the function fails (offline, outside the area, not deployed), this
 * returns null and the planning sheet simply shows the standard route, as before.
 */
import type { ConditionMode, LatLng, RoutingProfile, SmartRouteResponse } from '@scenic/shared';
import { useQuery } from '@tanstack/react-query';

import { smartRoute } from '@/lib/api';
import { isSupabaseConfigured } from '@/lib/supabase';

export function useSmartRoutes(args: {
  origin: LatLng | null;
  destination: LatLng | null;
  profile: RoutingProfile;
  /** The weather mode the "Now" card shows (live, the user's choice or simulated). */
  condition: ConditionMode;
  enabled: boolean;
}) {
  const { origin, destination, profile, condition, enabled } = args;
  return useQuery({
    queryKey: ['smart-route', origin, destination, profile, condition],
    enabled: enabled && isSupabaseConfigured && origin !== null && destination !== null,
    staleTime: 5 * 60_000,
    retry: false, // the standard route is already there; don't keep the user waiting
    queryFn: async (): Promise<SmartRouteResponse | null> => {
      try {
        // Sending the card's condition keeps the routes consistent with what the card says.
        return await smartRoute({ origin: origin!, destination: destination!, profile, condition });
      } catch (err) {
        console.warn('[smart-route] falling back to the standard route', err);
        return null;
      }
    },
  });
}
