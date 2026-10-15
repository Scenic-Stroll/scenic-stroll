/**
 * Places the user saved from a place card ("Save"). Kept on the phone only.
 * Shown later under Profile → Saved places.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LatLng } from '@scenic/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type SavedPlace = {
  id: string;
  label: string;
  point: LatLng;
  presetId?: string;
  savedAt: number;
};

type SavedPlacesState = {
  places: SavedPlace[];
  toggle: (place: Omit<SavedPlace, 'savedAt'>) => void;
};

export const useSavedPlaces = create<SavedPlacesState>()(
  persist(
    (set, get) => ({
      places: [],
      toggle: (place) => {
        const exists = get().places.some((p) => p.id === place.id);
        set({
          places: exists
            ? get().places.filter((p) => p.id !== place.id)
            : [{ ...place, savedAt: Date.now() }, ...get().places],
        });
      },
    }),
    {
      name: 'scenic-saved-places',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ places: s.places }),
    },
  ),
);
