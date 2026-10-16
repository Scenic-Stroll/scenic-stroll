/**
 * Position fixes for follow mode: real GPS, or — for demos away from Kowloon Tong — a simulated
 * walker that moves along the route (Profile → Diagnostics → "Simulate walk").
 */
import { pointAlong, WALK_SPEED_MPS, type LatLng } from '@scenic/shared';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef } from 'react';

export type Fix = { point: LatLng; accuracyM: number | null; atMs: number };

/** The demo walker goes 4× walking speed, so a 6-minute walk takes 1.5 minutes on stage. */
const SIM_SPEED_MPS = WALK_SPEED_MPS * 4;
const SIM_TICK_MS = 1000;
/** "Step off route" (demo) puts the walker this far to the side, beyond the 40 m limit. */
const SIDE_STEP_M = 60;

export function usePositionFeed({
  line,
  simulate,
  onFix,
}: {
  line: LatLng[];
  simulate: boolean;
  onFix: (fix: Fix) => void;
}) {
  // The latest callback, without restarting GPS every render.
  const onFixRef = useRef(onFix);
  useEffect(() => {
    onFixRef.current = onFix;
  });
  const steppedOff = useRef(false);

  // Real GPS. Not restarted when the route changes (re-planning doesn't move you).
  useEffect(() => {
    if (simulate) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    void (async () => {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted || cancelled) return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 2 },
        (pos) =>
          onFixRef.current({
            point: { lat: pos.coords.latitude, lng: pos.coords.longitude },
            accuracyM: pos.coords.accuracy ?? null,
            atMs: pos.timestamp,
          }),
      );
      if (cancelled) sub.remove();
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [simulate]);

  // Demo walker. A new route (after a re-plan) starts from its beginning — which is where you are.
  useEffect(() => {
    if (!simulate || line.length < 2) return;
    steppedOff.current = false;
    let alongM = 0;
    const tick = () => {
      // While "stepped off", the walker stands still beside the route (as if lost).
      if (!steppedOff.current) alongM += (SIM_SPEED_MPS * SIM_TICK_MS) / 1000;
      onFixRef.current({
        point: pointAlong(line, alongM, steppedOff.current ? SIDE_STEP_M : 0),
        accuracyM: 5,
        atMs: Date.now(),
      });
    };
    tick();
    const timer = setInterval(tick, SIM_TICK_MS);
    return () => clearInterval(timer);
  }, [line, simulate]);

  const stepOffRoute = useCallback(() => {
    steppedOff.current = true;
  }, []);
  return { stepOffRoute };
}
