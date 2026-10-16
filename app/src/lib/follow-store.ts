/**
 * Follow mode's live state, shared by the pieces that show it: the engine (follow-engine.tsx, does
 * the work), the panel in the bottom sheet and the route on the map. Not saved: a walk in progress
 * doesn't survive an app restart.
 */
import type { LatLng, RoutePosition } from '@scenic/shared';
import { randomUUID } from 'expo-crypto';
import { create } from 'zustand';

import type { FollowRoute } from '@/lib/follow-route';

/** A message at the top of the follow panel. */
export type FollowBanner =
  | { kind: 'notice'; text: string; undo?: boolean }
  | { kind: 'weather'; text: string; candidate: FollowRoute | null };

export type FollowSession = {
  /** Changes for every new walk, so the engine starts fresh. */
  id: number;
  /** Sent with the "was it as promised?" answer, so answering twice updates instead of adding. */
  walkId: string;
  startedAt: number;
  originLabel: string;
  destination: LatLng;
  destinationLabel: string;
  route: FollowRoute;
  /**
   * What was walked of earlier routes before a re-plan replaced them (line and, roughly, edges),
   * so feedback and "Save as a community route" cover the whole walk.
   */
  walkedBefore: { line: LatLng[]; edgeIds: number[] };
  /** Where you are (GPS or the demo walker); null until the first fix. */
  here: LatLng | null;
  position: RoutePosition | null;
  /** Seconds off the route so far (0 = on it). */
  secondsOff: number;
  /** Estimated arrival (ISO), from the time left on the route. */
  arriveAt: string | null;
  replanning: boolean;
  arrived: boolean;
  banner: FollowBanner | null;
  /** Keep the map centred on you; off once you pan the map yourself. */
  followCamera: boolean;
};

/** What the panel's buttons do; registered by the engine while it runs. */
export type FollowActions = {
  reportBlockedAhead: () => void;
  undoReport: () => void;
  acceptSwitch: () => void;
  /** Demo only: the simulated walker steps 60 m off the route. */
  stepOffRoute: () => void;
};

type FollowState = {
  session: FollowSession | null;
  actions: FollowActions | null;
  start: (
    route: FollowRoute,
    places: { originLabel: string; destination: LatLng; destinationLabel: string },
  ) => void;
  stop: () => void;
  patch: (changes: Partial<FollowSession>) => void;
};

export const useFollow = create<FollowState>((set) => ({
  session: null,
  actions: null,
  start: (route, { originLabel, destination, destinationLabel }) =>
    set({
      session: {
        id: Date.now(),
        walkId: randomUUID(),
        startedAt: Date.now(),
        originLabel,
        destination,
        destinationLabel,
        route,
        walkedBefore: { line: [], edgeIds: [] },
        here: null,
        position: null,
        secondsOff: 0,
        arriveAt: null,
        replanning: false,
        arrived: false,
        banner: null,
        followCamera: true,
      },
    }),
  stop: () => set({ session: null, actions: null }),
  patch: (changes) => set((s) => (s.session ? { session: { ...s.session, ...changes } } : {})),
}));

/** Demo switches (Profile → Diagnostics). Not saved, so they can't be left on by accident. */
type DemoState = { simulateWalk: boolean; setSimulateWalk: (on: boolean) => void };
export const useFollowDemo = create<DemoState>((set) => ({
  simulateWalk: false,
  setSimulateWalk: (simulateWalk) => set({ simulateWalk }),
}));
