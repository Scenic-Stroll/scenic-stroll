/**
 * Trip options for every way to travel (multimodal step 1: walk + car) from the `plan-trip`
 * function. Never shows an error: if it fails, this returns null and the planning sheet keeps its
 * walking routes — walking always works.
 */
import type { ConditionMode, LatLng, PlanTripResponse } from '@scenic/shared';
import { useQuery } from '@tanstack/react-query';

import { planTrip } from '@/lib/api';
import { isSupabaseConfigured } from '@/lib/supabase';

export function useTripPlan(args: {
  origin: LatLng | null;
  destination: LatLng | null;
  condition: ConditionMode;
  /** null = leave now. */
  departure: Date | null;
  enabled: boolean;
}) {
  const { origin, destination, condition, departure, enabled } = args;
  const departAt = departure?.toISOString();
  return useQuery({
    queryKey: ['plan-trip', origin, destination, condition, departAt],
    enabled: enabled && isSupabaseConfigured && origin !== null && destination !== null,
    // Traffic changes; the server caches 3 min, so asking again after 2 min is plenty.
    staleTime: 2 * 60_000,
    retry: false,
    queryFn: async (): Promise<PlanTripResponse | null> => {
      try {
        return await planTrip({
          origin: origin!,
          destination: destination!,
          condition,
          depart_at: departAt,
        });
      } catch (err) {
        console.warn('[plan-trip] unavailable — walking routes only', err);
        return null;
      }
    },
  });
}
