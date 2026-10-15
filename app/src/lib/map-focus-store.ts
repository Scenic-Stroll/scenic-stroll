/**
 * Lets other tabs ask the Map to show something:
 *   - a route ("tap a friend's activity → see it on the map"), or
 *   - a place, optionally routing to it ("Show on map" / "Route to friend").
 * The Map subscribes, acts, then calls `clear()`.
 */
import { create } from 'zustand';

import type { Place } from '@/screens/map/types';

type MapFocusState = {
  routeId: string | null;
  place: Place | null;
  /** true = start route planning to `place` instead of just showing it. */
  routeToPlace: boolean;
  focusRoute: (routeId: string) => void;
  focusPlace: (place: Place, routeTo?: boolean) => void;
  clear: () => void;
};

export const useMapFocus = create<MapFocusState>((set) => ({
  routeId: null,
  place: null,
  routeToPlace: false,
  focusRoute: (routeId) => set({ routeId, place: null, routeToPlace: false }),
  focusPlace: (place, routeTo = false) => set({ place, routeToPlace: routeTo, routeId: null }),
  clear: () => set({ routeId: null, place: null, routeToPlace: false }),
}));
