/**
 * Trip options for every way to travel (walk, MTR, car, taxi) from the `plan-trip` function.
 * Never shows an error: if it fails, this returns the saved demo answer for the demo trips
 * (labelled "saved", demo-trips.ts), else null and the planning sheet keeps its walking routes —
 * walking always works.
 */
import { withRushHour, type ConditionMode, type LatLng } from '@scenic/shared';
import { useQuery } from '@tanstack/react-query';

import { planTrip } from '@/lib/api';
import { savedDemoTrip, type TripPlan } from '@/lib/demo-trips';
import { useRushHour } from '@/lib/rush-hour-store';
import { isSupabaseConfigured } from '@/lib/supabase';

export function useTripPlan(args: {
  origin: LatLng | null;
  destination: LatLng | null;
  condition: ConditionMode;
  /** null = leave now. */
  departure: Date | null;
  enabled: boolean;
  /**
   * Re-plan this often (ms) while following a car/taxi option, to catch a faster route as
   * traffic changes (multimodal step 6). false = only when asked.
   */
  refreshMs?: number | false;
}) {
  const { origin, destination, condition, departure, enabled, refreshMs = false } = args;
  const departAt = departure?.toISOString();
  // Demo "Simulate rush hour": applied on top of the real answer, never sent to the server.
  const rushHour = useRushHour((s) => s.on);
  return useQuery({
    queryKey: ['plan-trip', origin, destination, condition, departAt],
    enabled: enabled && isSupabaseConfigured && origin !== null && destination !== null,
    // Traffic changes; the server caches 3 min, so asking again after 2 min is plenty.
    staleTime: 2 * 60_000,
    refetchInterval: refreshMs,
    select: (data: TripPlan | null): TripPlan | null =>
      rushHour && data ? { ...withRushHour(data), savedFor: data.savedFor } : data,
    retry: false,
    queryFn: async (): Promise<TripPlan | null> => {
      try {
        const live = await planTrip({
          origin: origin!,
          destination: destination!,
          condition,
          depart_at: departAt,
        });
        // Nothing at all came back (every provider failed): a saved demo answer is better.
        if (live.options.length > 0) return live;
        return savedDemoTrip(origin!, destination!) ?? live;
      } catch (err) {
        console.warn('[plan-trip] unavailable — saved demo trip or walking routes only', err);
        return savedDemoTrip(origin!, destination!);
      }
    },
  });
}
