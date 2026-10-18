/**
 * Demo switch: "Simulate rush hour" (Profile → Diagnostics). When on, every trip plan is shown with
 * cars and taxis stuck in a heavy jam (shared/src/rush-hour.ts) and labelled "simulated". Not
 * saved: it resets when the app restarts, so it can't be left on by accident.
 */
import { create } from 'zustand';

type RushHourState = {
  on: boolean;
  setOn: (on: boolean) => void;
};

export const useRushHour = create<RushHourState>((set) => ({
  on: false,
  setOn: (on) => set({ on }),
}));
