/**
 * The "segment strip" on a route option: what the walk is made of, in order —
 * e.g. outdoor → indoor → lift → indoor → footbridge → outdoor.
 *
 * Built from the route's checkpoints (the only reliable indoor/outdoor signal we have; GPS can't
 * tell). An `entrance` toggles between outdoor and indoor; lifts, escalators, stairs, footbridges
 * and underpasses are their own short segments. Notes don't change the strip.
 */
import type { CheckpointKind } from './schemas.ts';

export type SegmentKind =
  'outdoor' | 'indoor' | 'lift' | 'escalator' | 'stairs' | 'footbridge' | 'underpass';

export const SEGMENT_INFO: Record<SegmentKind, { en: string; zh: string; icon: string }> = {
  outdoor: { en: 'Outdoor', zh: '戶外', icon: 'walk' },
  indoor: { en: 'Indoor', zh: '室內', icon: 'office-building' },
  lift: { en: 'Lift', zh: '升降機', icon: 'elevator' },
  escalator: { en: 'Escalator', zh: '扶手電梯', icon: 'escalator' },
  stairs: { en: 'Stairs', zh: '樓梯', icon: 'stairs' },
  footbridge: { en: 'Footbridge', zh: '天橋', icon: 'bridge' },
  underpass: { en: 'Underpass', zh: '隧道', icon: 'tunnel' },
};

/** Ordered segments; consecutive duplicates are merged (outdoor, outdoor → outdoor). */
export function buildSegments(checkpointKinds: readonly CheckpointKind[]): SegmentKind[] {
  const segments: SegmentKind[] = [];
  const push = (s: SegmentKind) => {
    if (segments.at(-1) !== s) segments.push(s);
  };

  let inside = false;
  push('outdoor');
  for (const kind of checkpointKinds) {
    switch (kind) {
      case 'entrance':
        inside = !inside;
        push(inside ? 'indoor' : 'outdoor');
        break;
      case 'lift':
      case 'escalator':
      case 'stairs':
      case 'footbridge':
      case 'underpass':
        push(kind);
        // After the lift/bridge you continue in the same environment as before.
        push(inside ? 'indoor' : 'outdoor');
        break;
      case 'note':
        break;
    }
  }
  return segments;
}
