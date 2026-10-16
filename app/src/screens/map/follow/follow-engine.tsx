/**
 * Follow mode's engine: draws nothing, just reacts. Mounted while a walk is in progress (keyed by
 * the session id, so every walk starts fresh). It re-plans from where you are when:
 *   - you've been more than 40 m off the route for 20 s,
 *   - someone reports a path ahead of you blocked (Realtime),
 *   - an indoor link ahead will close before you get there,
 * and when the weather changes (the "Now" conditions refresh every 5 min) it offers a better route.
 * The rules themselves are plain functions in shared/src/follow.ts (unit-tested).
 */
import {
  ARRIVED_M,
  conditionChangeMessage,
  edgesUpTo,
  formatHkTime,
  haversineMeters,
  lineUpTo,
  locateOnRoute,
  missedClosing,
  pointAlong,
  remainingSeconds,
  reportHitsRoute,
  sameEdges,
  trackOffRoute,
  type ClosingWarning,
  type ConditionMode,
  type OffRouteState,
} from '@scenic/shared';
import { useCallback, useEffect, useRef } from 'react';

import { bestRouteFor, planFrom, type FollowRoute } from '@/lib/follow-route';
import { useFollow, useFollowDemo } from '@/lib/follow-store';
import { clearMyPathReports, reportBlockedPath, subscribeToPathReports } from '@/lib/path-reports';

import { usePositionFeed, type Fix } from './use-position-feed';

/** "Report blocked path ahead" reports the path this far in front of you. */
const BLOCKED_AHEAD_M = 30;

type Reason = 'off_route' | 'blocked' | 'reported' | 'closing';

function replanText(reason: Reason, closing?: ClosingWarning): string {
  switch (reason) {
    case 'off_route':
      return 'You left the route — here’s a new one from where you are.';
    case 'blocked':
      return 'A path ahead was just reported blocked — here’s a way around it.';
    case 'reported':
      return 'Thanks — reported for the next 3 hours. Here’s a way around it.';
    case 'closing':
      return `${closing?.name ?? 'An indoor link'} closes at ${
        closing ? formatHkTime(closing.closes_at) : 'soon'
      } — you won’t make it in time, so here’s a way around it.`;
  }
}

const session = () => useFollow.getState().session;

/**
 * The session changes for a new route: what was walked of the old one is kept (for feedback and
 * "Save as a community route"), the old route's position is dropped.
 */
function withNewRoute(next: FollowRoute) {
  const s = session();
  if (!s) return {};
  const walkedLine = lineUpTo(s.route.coordinates, s.position?.alongM ?? 0);
  return {
    route: next,
    walkedBefore: {
      line: [...s.walkedBefore.line, ...walkedLine],
      edgeIds: [...s.walkedBefore.edgeIds, ...edgesUpTo(s.route.edgeIds, s.position)],
    },
    position: null,
    secondsOff: 0,
  };
}

export function FollowEngine({ conditionMode }: { conditionMode: ConditionMode }) {
  const route = useFollow((s) => s.session?.route);
  const patch = useFollow((s) => s.patch);
  const simulate = useFollowDemo((s) => s.simulateWalk);

  const offRoute = useRef<OffRouteState>({ since: null });
  const busy = useRef(false); // a re-plan is running
  const reporting = useRef(false); // our own report is being sent
  const closingHandled = useRef<FollowRoute | null>(null);
  const condition = useRef(conditionMode);
  useEffect(() => {
    condition.current = conditionMode;
  });

  const replan = useCallback(
    async (reason: Reason, closing?: ClosingWarning) => {
      const s = session();
      if (!s?.here || busy.current) return;
      busy.current = true;
      patch({ replanning: true });
      try {
        const next = await planFrom({
          from: s.here,
          to: s.destination,
          profile: s.route.profile,
          condition: condition.current,
          // Only computed routes know which paths are blocked.
          preferComputed: reason === 'blocked' || reason === 'reported',
        });
        patch({
          ...withNewRoute(next),
          banner: {
            kind: 'notice',
            text: replanText(reason, closing),
            undo: reason === 'reported',
          },
        });
      } catch {
        patch({
          banner: {
            kind: 'notice',
            text: 'Couldn’t find a new route from here — keep to the line, or try again in a moment.',
          },
        });
      } finally {
        // Either way, give it another 20 s before re-planning again (no retry storm).
        offRoute.current = { since: null };
        busy.current = false;
        patch({ replanning: false });
      }
    },
    [patch],
  );

  const onFix = useCallback(
    (fix: Fix) => {
      const s = session();
      if (!s || s.arrived) return;
      const position = locateOnRoute(s.route.coordinates, fix.point);
      const arrived = haversineMeters(fix.point, s.destination) <= ARRIVED_M;
      const off = trackOffRoute(offRoute.current, {
        distM: position.distM,
        accuracyM: fix.accuracyM,
        atMs: fix.atMs,
      });
      offRoute.current = off.state;
      const leftS = remainingSeconds(s.route.duration_s, position);
      patch({
        here: fix.point,
        position,
        secondsOff: Math.floor(off.secondsOff),
        arriveAt: new Date(fix.atMs + leftS * 1000).toISOString(),
        arrived,
        ...(arrived ? { banner: null } : {}),
      });
      if (arrived || busy.current) return;
      if (off.replan) {
        void replan('off_route');
        return;
      }
      // At most one closing re-plan per route (the new route already avoids it).
      if (closingHandled.current !== s.route) {
        const missed = missedClosing(
          s.route.closing,
          s.route.coordinates,
          position.alongM,
          new Date(fix.atMs),
        );
        if (missed) {
          closingHandled.current = s.route;
          void replan('closing', missed);
        }
      }
    },
    [patch, replan],
  );

  const feed = usePositionFeed({ line: route?.coordinates ?? [], simulate, onFix });

  // Someone (anyone) reports a path blocked: re-plan if it's on the rest of my route.
  useEffect(
    () =>
      subscribeToPathReports((report) => {
        const s = session();
        if (!s || s.arrived || reporting.current) return;
        const line = { line: s.route.coordinates, edgeIds: s.route.edgeIds };
        if (reportHitsRoute(report, line, s.position?.alongM ?? 0)) void replan('blocked');
      }),
    [replan],
  );

  // The weather changed (live, the "Now" card, or the demo switch): offer the best route for it.
  const lastMode = useRef(conditionMode);
  useEffect(() => {
    const from = lastMode.current;
    if (from === conditionMode) return;
    lastMode.current = conditionMode;
    const s = session();
    if (!s?.here || s.arrived) return;
    let cancelled = false;
    void bestRouteFor({ from: s.here, to: s.destination, condition: conditionMode }).then(
      (best) => {
        const now = session();
        if (cancelled || !now) return;
        const leftS = now.position
          ? remainingSeconds(now.route.duration_s, now.position)
          : now.route.duration_s;
        const viaIndoor = best?.option?.explanation.facts.via_indoor;
        const message = conditionChangeMessage({
          from,
          to: conditionMode,
          candidate: best?.profile
            ? {
                profile: best.profile,
                duration_s: best.duration_s,
                viaIndoor: typeof viaIndoor === 'string' ? viaIndoor : null,
              }
            : null,
          remainingS: leftS,
          same: best !== null && sameEdges(best.edgeIds, now.route.edgeIds),
        });
        patch({
          banner: {
            kind: 'weather',
            text: message.text,
            candidate: message.offerSwitch ? best : null,
          },
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [conditionMode, patch]);

  // What the panel's buttons do.
  const { stepOffRoute } = feed;
  useEffect(() => {
    useFollow.setState({
      actions: {
        reportBlockedAhead: () => {
          const s = session();
          if (!s?.position || busy.current) {
            patch({ banner: { kind: 'notice', text: 'Waiting for your location…' } });
            return;
          }
          const ahead = pointAlong(s.route.coordinates, s.position.alongM + BLOCKED_AHEAD_M);
          reporting.current = true;
          void reportBlockedPath(ahead)
            .then(() => {
              reporting.current = false;
              return replan('reported');
            })
            .catch((err: Error) => {
              reporting.current = false;
              patch({ banner: { kind: 'notice', text: err.message } });
            });
        },
        undoReport: () => {
          void clearMyPathReports()
            .then(() => patch({ banner: { kind: 'notice', text: 'Report removed.' } }))
            .catch((err: Error) => patch({ banner: { kind: 'notice', text: err.message } }));
        },
        acceptSwitch: () => {
          const s = session();
          if (s?.banner?.kind !== 'weather' || !s.banner.candidate) return;
          offRoute.current = { since: null };
          patch({ ...withNewRoute(s.banner.candidate), banner: null });
        },
        stepOffRoute,
      },
    });
  }, [patch, replan, stepOffRoute]);

  return null;
}
