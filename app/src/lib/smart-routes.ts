/**
 * Smart routes for the planning sheet: our own computed routes from the `smart-route` function.
 * Never shows an error: if the function fails (offline, outside the area, not deployed), this
 * returns the routes saved for the demo trips if it's one of those (demo-snapshot.ts), else null and
 * the planning sheet simply shows the standard route, as before.
 */
import type { ConditionMode, LatLng, RoutingProfile, SmartRouteResponse } from '@scenic/shared';
import { useQuery } from '@tanstack/react-query';

import { smartRoute } from '@/lib/api';
import { savedDemoRoutes, type SavedRoutes } from '@/lib/demo-snapshot';
import { isSupabaseConfigured } from '@/lib/supabase';

export function useSmartRoutes(args: {
  origin: LatLng | null;
  destination: LatLng | null;
  profile: RoutingProfile;
  /** The weather mode the "Now" card shows (live, the user's choice or simulated). */
  condition: ConditionMode;
  /** When you'll leave; null = now (the server uses its own clock). */
  departure: Date | null;
  enabled: boolean;
}) {
  const { origin, destination, profile, condition, departure, enabled } = args;
  const departureTime = departure?.toISOString();
  return useQuery({
    queryKey: ['smart-route', origin, destination, profile, condition, departureTime],
    enabled: enabled && isSupabaseConfigured && origin !== null && destination !== null,
    staleTime: 5 * 60_000,
    retry: false, // the standard route is already there; don't keep the user waiting
    queryFn: async (): Promise<SmartRouteResponse | SavedRoutes | null> => {
      try {
        // Sending the card's condition keeps the routes consistent with what the card says.
        return await smartRoute({
          origin: origin!,
          destination: destination!,
          profile,
          condition,
          departure_time: departureTime,
        });
      } catch (err) {
        const saved = savedDemoRoutes({
          origin: origin!,
          destination: destination!,
          profile,
          condition,
        });
        console.warn(
          `[smart-route] ${saved ? 'using the routes saved for the demo' : 'falling back to the standard route'}`,
          err,
        );
        return saved;
      }
    },
  });
}
