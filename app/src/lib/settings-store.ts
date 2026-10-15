/**
 * App settings kept on the phone between launches.
 *
 * Data collection mode is for the team's Oct 10–11 walk at CityU: bigger buttons, auto-numbered
 * titles ("Route 7") and a "save & record another" button. Hidden away in Settings.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemePreference = 'system' | 'light' | 'dark';

type SettingsState = {
  dataCollectionMode: boolean;
  /** Profile → Theme. 'system' follows the phone. */
  themePreference: ThemePreference;
  /** Next number for auto-numbered titles in data collection mode. */
  nextRouteNumber: number;
  setDataCollectionMode: (on: boolean) => void;
  setThemePreference: (t: ThemePreference) => void;
  /** Returns the next "Route N" title and advances the counter. */
  takeRouteNumber: () => number;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      dataCollectionMode: false,
      nextRouteNumber: 1,
      themePreference: 'system',
      setDataCollectionMode: (on) => set({ dataCollectionMode: on }),
      setThemePreference: (t) => set({ themePreference: t }),
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
        themePreference: s.themePreference,
      }),
    },
  ),
);
