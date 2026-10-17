/**
 * Turn each operator's real-time API answer into our StopArrival shape (eta-schema.ts).
 * Pure functions (no fetching) so they can be tested with recorded answers. A malformed answer
 * throws — the caller then shows "live times unavailable", never made-up times.
 *
 * Endpoints (checked 2026-10-18, all via DATA.GOV.HK):
 *   MTR  https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=KTL&sta=KOT
 *   KMB  https://data.etabus.gov.hk/v1/transport/kmb/stop-eta/{stop}
 *   CTB  https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/{stop}/{route}
 *   GMB  https://data.etagmb.gov.hk/eta/stop/{stop_id}
 */
import type { GmbRoute, StopArrival } from './eta-schema.ts';
import { MTR_STATIONS } from './mtr-data.ts';

/** MTR writes local Hong Kong time with no zone ("2026-10-18 06:21:19"). */
const hkTime = (s: string) => `${s.replace(' ', 'T')}+08:00`;

const byTime = (a: StopArrival, b: StopArrival) => Date.parse(a.at) - Date.parse(b.at);

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** Drop repeats: KMB lists a bus once per "service type" of the same route. */
function unique(list: StopArrival[]): StopArrival[] {
  const seen = new Set<string>();
  return list.filter((a) => {
    const key = `${a.route}|${a.dest_en}|${a.at}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// deno-lint-ignore no-explicit-any
type Json = any;

export function parseMtrSchedule(json: Json, line: string, station: string): StopArrival[] {
  // MTR answers { status: 0, message } when the line is suspended or the request is wrong.
  if (json?.status === 0) throw new Error(`MTR: ${json.message ?? 'no data'}`);
  const data = json?.data?.[`${line}-${station}`];
  if (!data) throw new Error(`MTR: no data for ${line}-${station}`);
  const delayed = json?.isdelay === 'Y';
  const trains: Json[] = [...(data.UP ?? []), ...(data.DOWN ?? [])];
  return trains
    .filter((t) => t?.valid !== 'N' && typeof t?.time === 'string')
    .map((t): StopArrival => {
      const dest = MTR_STATIONS.find((s) => s.code === t.dest);
      return {
        route: line,
        dest_en: dest?.en ?? String(t.dest),
        dest_zh: dest?.zh ?? String(t.dest),
        dest_code: String(t.dest),
        at: hkTime(t.time),
        platform: t.plat ? String(t.plat) : null,
        realtime: true,
        remark: delayed ? 'Delayed' : null,
      };
    })
    .sort(byTime);
}

/** KMB and Citybus share a format: one row per bus, `eta` empty when there's no bus coming. */
function parseBusRows(rows: Json[]): StopArrival[] {
  return unique(
    rows
      .filter((r) => typeof r?.eta === 'string' && r.eta)
      .map((r): StopArrival => ({
        route: String(r.route),
        dest_en: titleCase(String(r.dest_en ?? '')),
        dest_zh: String(r.dest_tc ?? ''),
        dest_code: null,
        at: r.eta,
        platform: null,
        // "Scheduled Bus" = from the timetable, not from a bus on the road.
        realtime: !/scheduled/i.test(String(r.rmk_en ?? '')),
        remark: r.rmk_en ? String(r.rmk_en) : null,
      })),
  ).sort(byTime);
}

export function parseKmbStopEta(json: Json): StopArrival[] {
  if (!Array.isArray(json?.data)) throw new Error('KMB: unexpected answer');
  return parseBusRows(json.data);
}

export function parseCtbEta(json: Json): StopArrival[] {
  if (!Array.isArray(json?.data)) throw new Error('Citybus: unexpected answer');
  return parseBusRows(json.data);
}

export function parseGmbStopEta(json: Json, routes: Record<string, GmbRoute>): StopArrival[] {
  if (!Array.isArray(json?.data)) throw new Error(`GMB: ${json?.message ?? 'unexpected answer'}`);
  return json.data
    .flatMap((r: Json): StopArrival[] => {
      const route = routes[String(r.route_id)];
      const dest = route?.dest[String(r.route_seq)];
      if (!route || !r.enabled || !Array.isArray(r.eta)) return [];
      return r.eta
        .filter((e: Json) => typeof e?.timestamp === 'string')
        .map((e: Json): StopArrival => ({
          route: route.code,
          dest_en: dest?.en ?? '',
          dest_zh: dest?.zh ?? '',
          dest_code: null,
          at: e.timestamp,
          platform: null,
          realtime: true,
          remark: e.remarks_en ? String(e.remarks_en) : null,
        }));
    })
    .sort(byTime);
}
