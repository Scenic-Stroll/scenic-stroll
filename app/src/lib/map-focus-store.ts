/**
 * Lets other tabs ask the Map to show a route ("tap a friend's activity → see it on the map").
 * The Map reads `routeId`, selects that route, then calls `clear()`.
 */
import { create } from 'zustand';

type MapFocusState = {
  routeId: string | null;
  focusRoute: (routeId: string) => void;
  clear: () => void;
};

export const useMapFocus = create<MapFocusState>((set) => ({
  routeId: null,
  focusRoute: (routeId) => set({ routeId }),
  clear: () => set({ routeId: null }),
}));
