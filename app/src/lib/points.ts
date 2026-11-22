/**
 * Points in the app (D55): the Profile summary, and telling the server what happened. The server
 * (award-points) decides the points — the app never sends a number. Under-18s get badges only, so
 * nothing here runs for them.
 */
import { AwardPointsResponseSchema, FUNCTIONS, type ReadingLevel } from '@scenic/shared';
import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { deviceStorage } from '@/lib/device-storage';
import * as localDb from '@/lib/local-db';
import { queryClient } from '@/lib/query-client';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { currentFeatureRules, useFeatureRules } from '@/lib/user-settings';

export type PointsSummary = {
  balance: number;
  todayPoints: number;
  todayMeters: number;
  /** Old-rule points (+10 per route, +5 per description) earned before 24 Nov 2026. */
  earlierPoints: number;
};

const SUMMARY_KEY = ['points-summary'] as const;

export function usePointsSummary() {
  const rules = useFeatureRules();
  return useQuery({
    queryKey: SUMMARY_KEY,
    enabled: isSupabaseConfigured && rules.points,
    queryFn: async (): Promise<PointsSummary> => {
      const { data, error } = await supabase.rpc('my_points_summary');
      if (error) throw new Error('Couldn’t load your points.');
      const row = (data as Record<string, number | string>[])[0] ?? {};
      return {
        balance: Number(row.balance ?? 0),
        todayPoints: Number(row.today_points ?? 0),
        todayMeters: Number(row.today_meters ?? 0),
        earlierPoints: Number(row.earlier_points ?? 0),
      };
    },
  });
}

const refreshSummary = () => queryClient.invalidateQueries({ queryKey: SUMMARY_KEY });

async function award(body: Record<string, unknown>): Promise<number> {
  const { data, error } = await supabase.functions.invoke(FUNCTIONS.awardPoints, {
    method: 'POST',
    body,
  });
  if (error) throw error;
  return AwardPointsResponseSchema.parse(data).awarded;
}

// ---- Walks: queued on the device, sent when online (like route uploads) -----------------------

const useWalkQueue = create<{
  pending: string[];
  add: (id: string) => void;
  remove: (id: string) => void;
}>()(
  persist(
    (set, get) => ({
      pending: [],
      add: (id) => set({ pending: [...new Set([...get().pending, id])] }),
      remove: (id) => set({ pending: get().pending.filter((p) => p !== id) }),
    }),
    { name: 'scenic-walk-points-queue', storage: createJSONStorage(() => deviceStorage) },
  ),
);

/** A recording just finished: its distance earns points (adults only). */
export function queueWalkForPoints(recordingId: string) {
  if (!currentFeatureRules().points) return;
  useWalkQueue.getState().add(recordingId);
  void processWalkQueue();
}

let running: Promise<void> | null = null;

/** Sends queued walks. Never throws; what fails stays queued for the next try. */
export function processWalkQueue(): Promise<void> {
  running ??= (async () => {
    if (!currentFeatureRules().points) return;
    for (const id of useWalkQueue.getState().pending) {
      const recording = await localDb.loadRecording(id);
      if (!recording || recording.samples.length < 2) {
        useWalkQueue.getState().remove(id); // deleted or empty: nothing to count
        continue;
      }
      try {
        await award({ action: 'walk', walk_id: id, samples: recording.samples });
        useWalkQueue.getState().remove(id);
      } catch (err) {
        // 4xx (too old, safety mode): drop it; network or server trouble: keep it for later.
        const status = (err as { context?: { status?: number } }).context?.status;
        if (status && status >= 400 && status < 500) useWalkQueue.getState().remove(id);
        else break;
      }
    }
    await refreshSummary();
  })().finally(() => {
    running = null;
  });
  return running;
}

// ---- Pin reading ---------------------------------------------------------------------------------

/** The reader opened: the server starts timing (pin-read points need ≥ 10 s). */
export async function startPinReadTimer(pinId: string) {
  if (!currentFeatureRules().points) return;
  await supabase.rpc('start_pin_read', { p_pin: pinId });
}

/** "Done reading": the server records it and awards pin-read points if it was long enough. */
export async function finishPinRead(pinId: string, level: ReadingLevel): Promise<number> {
  if (!currentFeatureRules().points) return 0;
  try {
    const awarded = await award({ action: 'pin_read', pin_id: pinId, level });
    await refreshSummary();
    return awarded;
  } catch {
    return 0; // offline: the reading still counts on the device
  }
}
