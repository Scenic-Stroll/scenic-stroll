/**
 * What the `eta` Edge Function needs to know about a stop to ask its operator: the operator, its
 * code and (MTR, Citybus) which lines/routes to ask about — Citybus has no "all routes at this
 * stop" call. No names or positions, so the function bundle stays small (those are in demo-stops.ts
 * for the app).
 */
import type { TransitOperator } from './eta-schema.ts';
import { MTR_STATIONS } from './mtr-data.ts';
import { mtrLinesAt } from './mtr-lines.ts';
import { CTB_STOP_ROUTES } from './stop-routes.ts';

export type EtaStop = { id: string; operator: TransitOperator; code: string; routes: string[] };

export function etaStop(id: string): EtaStop | null {
  const [operator, code] = id.split(':');
  if (!code) return null;
  switch (operator) {
    case 'mtr':
      return MTR_STATIONS.some((s) => s.code === code)
        ? { id, operator, code, routes: mtrLinesAt(code) }
        : null;
    case 'ctb': {
      const routes = CTB_STOP_ROUTES[code];
      return routes ? { id, operator, code, routes } : null;
    }
    // KMB and minibus answer for every route at a stop in one call, so any stop id works.
    case 'kmb':
    case 'gmb':
      return { id, operator, code, routes: [] };
    default:
      return null;
  }
}
