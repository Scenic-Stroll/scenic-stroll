/**
 * Live walking conditions for the "Now" card and route priorities: weather from the `conditions`
 * Edge Function (Hong Kong Observatory), refreshed every 5 minutes.
 *
 * Never leaves the user with nothing: if the server can't be reached, the phone works out
 * day / night itself (source 'defaults') and the card says live weather is unavailable.
 */
import {
  defaultConditions,
  simulateConditions,
  type ConditionMode,
  type Conditions,
} from '@scenic/shared';
import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';

import { fetchConditions } from '@/lib/api';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

type ConditionsUiState = {
  /** The user's choice on the "Now" card; null = follow the weather. Not saved: weather changes. */
  modeOverride: ConditionMode | null;
  /**
   * Demo only (Profile → Diagnostics): pretend the weather is this mode, for the pitch.
   * Not saved either, so it can't be left on by accident after a restart.
   */
  simulated: ConditionMode | null;
  setModeOverride: (mode: ConditionMode | null) => void;
  setSimulated: (mode: ConditionMode | null) => void;
};

export const useConditionsUi = create<ConditionsUiState>((set) => ({
  modeOverride: null,
  simulated: null,
  setModeOverride: (modeOverride) => set({ modeOverride }),
  setSimulated: (simulated) => set({ simulated }),
}));

/** HKO updates hourly and the server caches for 10 min, so asking every 5 min is plenty. */
const REFRESH_MS = 5 * 60_000;

export const conditionsKey = ['conditions'] as const;

export function useConditions() {
  const auth = useAuth();
  const signedIn = auth.status === 'signed-in';
  const { modeOverride, simulated } = useConditionsUi();

  const query = useQuery({
    queryKey: conditionsKey,
    enabled: signedIn && isSupabaseConfigured,
    staleTime: REFRESH_MS - 60_000,
    refetchInterval: REFRESH_MS,
    queryFn: async (): Promise<Conditions> => {
      try {
        return await fetchConditions();
      } catch (err) {
        // Offline or server trouble: fall back instead of showing an error — routing still works.
        console.warn('[conditions]', err);
        return defaultConditions(new Date());
      }
    },
    // While loading (or before sign-in finishes), show day/night from the phone's clock.
    placeholderData: () => defaultConditions(new Date()),
  });

  const real = query.data ?? null;
  const conditions = real && simulated ? simulateConditions(real, simulated) : real;
  return {
    conditions,
    isSimulated: simulated !== null,
    /** What routes are prioritised for: the user's choice, else the weather. */
    mode: modeOverride ?? conditions?.mode ?? 'normal',
    isOverridden: modeOverride !== null,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}
