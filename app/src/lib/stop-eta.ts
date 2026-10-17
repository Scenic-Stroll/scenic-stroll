/**
 * Live arrivals for the stop card (multimodal step 3), refreshed every 30 s while it's open —
 * the server caches 30 s too, so this never asks an operator more often than that.
 * Returns null (not an error) when the backend can't be reached: the card then says
 * "live times unavailable" and still shows which routes stop here.
 */
import type { StopEtaResponse } from '@scenic/shared';
import { useQuery } from '@tanstack/react-query';

import { fetchStopEta } from '@/lib/api';
import { isSupabaseConfigured } from '@/lib/supabase';

export const STOP_ETA_REFRESH_MS = 30_000;

export function useStopEta(stopId: string | null) {
  return useQuery({
    queryKey: ['stop-eta', stopId],
    enabled: isSupabaseConfigured && stopId !== null,
    refetchInterval: STOP_ETA_REFRESH_MS,
    retry: false,
    queryFn: async (): Promise<StopEtaResponse | null> => {
      try {
        return await fetchStopEta(stopId!);
      } catch (err) {
        console.warn('[eta] unavailable', err);
        return null;
      }
    },
  });
}
