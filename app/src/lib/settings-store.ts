/**
 * App settings kept on the phone between launches.
 *
 * Data collection mode is for the team's Oct 10–11 walk at CityU: bigger buttons, auto-numbered
 * titles ("Route 7") and a "save & record another" button. Hidden away in Settings.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type SettingsState = {
  dataCollectionMode: boolean;
  /** Next number for auto-numbered titles in data collection mode. */
  nextRouteNumber: number;
  setDataCollectionMode: (on: boolean) => void;
  /** Returns the next "Route N" title and advances the counter. */
  takeRouteNumber: () => number;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      dataCollectionMode: false,
      nextRouteNumber: 1,
      setDataCollectionMode: (on) => set({ dataCollectionMode: on }),
      takeRouteNumber: () => {
        const n = get().nextRouteNumber;
        set({ nextRouteNumber: n + 1 });
        return n;
      },
    }),
    {
      name: 'scenic-settings',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist data, not the functions.
      partialize: (s) => ({
        dataCollectionMode: s.dataCollectionMode,
        nextRouteNumber: s.nextRouteNumber,
      }),
    },
  ),
);
