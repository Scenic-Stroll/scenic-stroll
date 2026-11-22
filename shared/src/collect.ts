/**
 * Collecting pins while walking (docs/PINS.md, D54). Pure: the app feeds it location fixes while it
 * is open and tracking (navigation or recording), and it says which pins were just collected.
 *
 * A pin is collected when a good fix (accuracy ≤ 30 m) is inside its radius AND either the next
 * fix is a good fix inside too, or the walker has been inside for ≥ 5 s (when vague fixes came in
 * between). One fix alone is never enough: between tall buildings GPS drifts, and a single stray
 * fix would collect pins across the street.
 * Fixes that jump faster than walking (the recorder's GPS jump filter) are ignored.
 */
import { haversineMeters } from './geo.ts';
import { acceptSample, type GpsSample } from './gps.ts';

export const COLLECT_RULES = {
  /** Fixes less accurate than this are ignored (they don't collect and don't reset). */
  maxAccuracyM: 30,
  /** Inside this long (from the first good fix inside) also collects. */
  dwellMs: 5000,
} as const;

export type CollectablePin = { id: string; lat: number; lng: number; radius_m: number };

type InsideEntry = {
  /** Time of the first good fix inside. */
  since: number;
  /** true if the fix just before this one was a good fix inside (nothing vague in between). */
  consecutive: boolean;
};

export type CollectState = {
  /** The last fix that passed the accuracy and jump checks. */
  lastGood: GpsSample | null;
  /** Pins the walker is inside of. */
  inside: Record<string, InsideEntry>;
};

export const EMPTY_COLLECT_STATE: CollectState = { lastGood: null, inside: {} };

/** A vague or jumped fix tells us nothing: keep the entries, but the next good fix isn't "next". */
function breakChains(state: CollectState): CollectState {
  const inside: Record<string, InsideEntry> = {};
  for (const [id, e] of Object.entries(state.inside)) inside[id] = { ...e, consecutive: false };
  return { ...state, inside };
}

/**
 * Feeds one fix. Returns the new state and the ids of pins collected by this fix (never pins in
 * `alreadyCollected`).
 */
export function collectStep(
  state: CollectState,
  fix: GpsSample,
  pins: readonly CollectablePin[],
  alreadyCollected: ReadonlySet<string>,
): { state: CollectState; collected: string[] } {
  if (fix.accuracy === null || fix.accuracy > COLLECT_RULES.maxAccuracyM) {
    return { state: breakChains(state), collected: [] }; // too vague to tell
  }
  if (!acceptSample(state.lastGood, fix).ok) {
    return { state: breakChains(state), collected: [] }; // a GPS jump or an out-of-order fix
  }

  const inside: Record<string, InsideEntry> = {};
  const collected: string[] = [];
  for (const pin of pins) {
    if (alreadyCollected.has(pin.id)) continue;
    if (haversineMeters(fix, pin) > pin.radius_m) continue; // outside: forget any earlier entry
    const entry = state.inside[pin.id];
    if (!entry) {
      inside[pin.id] = { since: fix.timestamp, consecutive: true }; // first good fix inside
    } else if (entry.consecutive || fix.timestamp - entry.since >= COLLECT_RULES.dwellMs) {
      collected.push(pin.id); // the next fix is inside too, or inside for ≥ 5 s
    } else {
      inside[pin.id] = { since: entry.since, consecutive: true };
    }
  }
  return { state: { lastGood: fix, inside }, collected };
}
