/**
 * One colour per kind of stretch on a smart route — used by the map lines, the exposure bar and the
 * legend, so they always match: sun = orange, shade = green, covered = blue, indoor = purple.
 */
import type { RunStyle } from '@scenic/shared';

import type { Palette } from '@/theme';

export function runColor(style: RunStyle, t: Palette): string {
  switch (style) {
    case 'sun':
      return t.routeSun;
    case 'shade':
      return t.routeShade;
    case 'covered':
      return t.routeCovered;
    case 'indoor':
    case 'lift':
    case 'escalator':
      return t.routeIndoor;
    case 'stairs':
      return t.routeStairs;
    case 'open':
      return t.routeOpen;
  }
}

export const RUN_LABELS: Record<'sun' | 'shade' | 'covered' | 'indoor' | 'open', string> = {
  sun: 'In the sun',
  shade: 'Shade',
  covered: 'Covered',
  indoor: 'Indoors',
  open: 'Outdoors',
};
