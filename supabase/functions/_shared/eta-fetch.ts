// Live arrivals for one stop, from the operator's real-time API (multimodal step 3).
// Used by the `eta` function (stop cards) and by plan-trip (next train/bus in a trip).
// Answers are cached 30 s in public.api_cache: everyone looking at the same stop shares one call,
// which keeps us well inside the operators' fair-use limits. A failed operator call gives
// status 'unavailable' — the app then says "live times unavailable", never guesses.
import type { SupabaseContext } from '@supabase/server';

import { budgetedCall } from './api-budget.ts';
import {
  parseCtbEta,
  parseGmbStopEta,
  parseKmbStopEta,
  parseMtrSchedule,
} from './scenic/transit/eta-parse.ts';
import type { StopArrival, StopEtaResponse } from './scenic/transit/eta-schema.ts';
import { etaStop, type EtaStop } from './scenic/transit/eta-stop.ts';
import { GMB_ROUTES } from './scenic/transit/stop-routes.ts';

type Admin = SupabaseContext['supabaseAdmin'];

const ETA_CACHE_S = 30;
/** Free APIs, but log and cap anyway so a bug can't hammer them. */
const ETA_DAILY_CAP = 20_000;

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${new URL(url).host} HTTP ${res.status}`);
  return await res.json();
}

/** Ask the operator. MTR and Citybus need one call per line/route; KMB and GMB one per stop. */
async function fetchArrivals(stop: EtaStop, signal: AbortSignal): Promise<StopArrival[]> {
  switch (stop.operator) {
    case 'mtr': {
      const lists = await Promise.all(
        stop.routes.map(async (line) =>
          parseMtrSchedule(
            await getJson(
              `https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=${line}&sta=${stop.code}`,
              signal,
            ),
            line,
            stop.code,
          ),
        ),
      );
      return lists.flat().sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    }
    case 'kmb':
      return parseKmbStopEta(
        await getJson(`https://data.etabus.gov.hk/v1/transport/kmb/stop-eta/${stop.code}`, signal),
      );
    case 'ctb': {
      const lists = await Promise.all(
        stop.routes.map(async (route) =>
          parseCtbEta(
            await getJson(
              `https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${stop.code}/${route}`,
              signal,
            ),
          ),
        ),
      );
      return lists.flat().sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    }
    case 'gmb':
      return parseGmbStopEta(
        await getJson(`https://data.etagmb.gov.hk/eta/stop/${stop.code}`, signal),
        GMB_ROUTES,
      );
  }
}

export async function stopEta(
  admin: Admin,
  stopId: string,
  signal: AbortSignal,
): Promise<StopEtaResponse | null> {
  const stop = etaStop(stopId);
  if (!stop) return null;
  try {
    const { value } = await budgetedCall(
      admin,
      {
        api: `eta_${stop.operator}`,
        key: `eta:${stop.id}`,
        ttlS: ETA_CACHE_S,
        dailyCap: ETA_DAILY_CAP,
      },
      async (): Promise<StopEtaResponse> => ({
        stop_id: stop.id,
        status: 'live',
        arrivals: await fetchArrivals(stop, signal),
        fetched_at: new Date().toISOString(),
      }),
    );
    // Cached up to 30 s: drop anything that has left since.
    const now = Date.now() - 30_000;
    return { ...value, arrivals: value.arrivals.filter((a) => Date.parse(a.at) >= now) };
  } catch (err) {
    console.warn(`eta: ${stop.id} unavailable`, err);
    return {
      stop_id: stop.id,
      status: 'unavailable',
      arrivals: [],
      fetched_at: new Date().toISOString(),
    };
  }
}
