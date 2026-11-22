/**
 * The pins this person has collected, kept on the device for everyone (D54):
 *   * adults: also saved on the server (collection_entries) — synced when online;
 *   * under-18s (safety mode): ONLY here; the server just counts "pin unlocked" (pin, day).
 * Read state is kept here too; for adults the server records it when points are awarded (phase 5).
 */
import type { ReadingLevel } from '@scenic/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { deviceStorage } from '@/lib/device-storage';

export type CollectedPin = {
  pinId: string;
  title: string;
  collectedAt: number;
  readAt: number | null;
  readLevel: ReadingLevel | null;
  /** The server knows about this collection (adults) or the unlock was counted (under-18s). */
  synced: boolean;
};

type CollectionState = {
  /** Whose collection this is: a different account on this device starts empty. */
  userId: string | null;
  pins: Record<string, CollectedPin>;
  add: (userId: string, pin: { pinId: string; title: string }, at?: number) => boolean;
  markRead: (pinId: string, level: ReadingLevel, at?: number) => void;
  markSynced: (pinId: string) => void;
  clear: () => void;
};

export const useCollection = create<CollectionState>()(
  persist(
    (set, get) => ({
      userId: null,
      pins: {},
      add: (userId, pin, at = Date.now()) => {
        const state = get();
        const pins = state.userId === userId ? state.pins : {};
        if (pins[pin.pinId]) return false;
        set({
          userId,
          pins: {
            ...pins,
            [pin.pinId]: {
              ...pin,
              collectedAt: at,
              readAt: null,
              readLevel: null,
              synced: false,
            },
          },
        });
        return true;
      },
      markRead: (pinId, level, at = Date.now()) => {
        const p = get().pins[pinId];
        if (!p || p.readAt) return;
        set({ pins: { ...get().pins, [pinId]: { ...p, readAt: at, readLevel: level } } });
      },
      markSynced: (pinId) => {
        const p = get().pins[pinId];
        if (p) set({ pins: { ...get().pins, [pinId]: { ...p, synced: true } } });
      },
      clear: () => set({ userId: null, pins: {} }),
    }),
    { name: 'scenic-pin-collection', storage: createJSONStorage(() => deviceStorage) },
  ),
);

/** The collection of this account, unread first, newest first. */
export function sortedCollection(pins: Record<string, CollectedPin>): CollectedPin[] {
  return Object.values(pins).sort(
    (a, b) =>
      Number(a.readAt !== null) - Number(b.readAt !== null) || b.collectedAt - a.collectedAt,
  );
}
