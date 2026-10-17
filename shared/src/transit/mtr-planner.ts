/**
 * Our own MTR journey planner — the fallback when Google transit isn't available (multimodal
 * step 2). MTR heavy rail only (buses need Google or real-time feeds, later steps).
 *
 * Lines and stations are MTR's open data (fares are filled in by plan-trip from public.mtr_fares,
 * see mtr-fares.ts); ride times are ESTIMATED from the
 * distance between stations (MTR doesn't publish run times), so every option says so:
 *   ride between neighbouring stations = DWELL_S + distance / CRUISE_MPS
 *   first wait = half a typical off-peak headway; each change of line = TRANSFER_S
 * Checked against the timetable feel: Kowloon Tong → Mong Kok East ≈ 4 min, Shek Kip Mei ≈ 2 min.
 */
import { haversineMeters } from '../geo.ts';
import type { LatLng } from '../schemas.ts';
import { mtrUsefulDests } from './mtr-lines.ts';
import { MTR_LINES, MTR_STATIONS } from './mtr-data.ts';
import type { TransitPlan, TransitPlanLeg } from './transit-plan.ts';

/** Average speed between stations including acceleration (m/s) and time stopped at each station. */
export const CRUISE_MPS = 18;
export const DWELL_S = 40;
/** Waiting for the first train: half a ~5-minute headway. Real-time ETAs replace this (step 3). */
export const FIRST_WAIT_S = 150;
/** Changing line at an interchange: walk + wait. */
export const TRANSFER_S = 240;
/** Changing via a walkway between two stations (Central ↔ Hong Kong, TST ↔ East TST). */
export const WALK_LINK_S = 360;
/** From the street to the platform (and back) at each end. */
export const STATION_ACCESS_S = 120;
/** Stations within this of the start/end are tried, the nearest 3. */
export const STATION_SEARCH_M = 1500;
/** Straight-line walks are about this much longer on real streets. */
const WALK_DETOUR = 1.25;
const WALK_MPS = 1.3;

type Station = (typeof MTR_STATIONS)[number];
type Line = (typeof MTR_LINES)[number];

const stationById = new Map<number, Station>(MTR_STATIONS.map((s) => [s.id, s]));

/** Stations connected by a walkway (different station ids in MTR's data). */
const WALK_LINKS: [string, string][] = [
  ['Central', 'Hong Kong'],
  ['Tsim Sha Tsui', 'East Tsim Sha Tsui'],
];

/** Every other station id you can change to from `id` (same name on another line, or a walkway). */
function changesAt(id: number): { to: number; cost: number }[] {
  const s = stationById.get(id)!;
  const out: { to: number; cost: number }[] = [];
  for (const o of MTR_STATIONS) {
    if (o.id === id) continue;
    if (o.en === s.en) out.push({ to: o.id, cost: TRANSFER_S });
    for (const [a, b] of WALK_LINKS) {
      if ((s.en === a && o.en === b) || (s.en === b && o.en === a)) {
        out.push({ to: o.id, cost: WALK_LINK_S });
      }
    }
  }
  return out;
}

const rideS = (a: Station, b: Station) => DWELL_S + haversineMeters(a, b) / CRUISE_MPS;

export function nearestStations(p: LatLng, maxM = STATION_SEARCH_M, limit = 3) {
  return MTR_STATIONS.map((station) => ({ station, distM: haversineMeters(p, station) }))
    .filter((x) => x.distM <= maxM)
    .sort((a, b) => a.distM - b.distM)
    .slice(0, limit);
}

type Move = { line: Line; from: Station; to: Station };

/**
 * Quickest journey between two stations: Dijkstra over (station, line). Branches of the same
 * line (East Rail to Lo Wu / Lok Ma Chau) count as one line: no change needed.
 */
export function findMtrJourney(
  fromId: number,
  toId: number,
): { moves: Move[]; rideS: number; changeS: number } | null {
  const key = (id: number, line: string) => `${id}|${line}`;
  const dist = new Map<string, number>();
  const prev = new Map<string, { from: string; move: Move | null; change: number }>();
  const queue: [number, number, string][] = []; // [cost, stationId, lineKey]
  for (const line of MTR_LINES) {
    if ((line.stations as readonly number[]).includes(fromId)) {
      dist.set(key(fromId, line.key), 0);
      queue.push([0, fromId, line.key]);
    }
  }
  const done = new Set<string>();
  let end: string | null = null;
  while (queue.length > 0) {
    queue.sort((a, b) => a[0] - b[0]);
    const [cost, id, lineKey] = queue.shift()!;
    const k = key(id, lineKey);
    if (done.has(k)) continue;
    done.add(k);
    if (id === toId) {
      end = k;
      break;
    }
    const line = MTR_LINES.find((l) => l.key === lineKey)!;
    const seq = line.stations as readonly number[];
    const relax = (nid: number, nline: string, c: number, move: Move | null, change: number) => {
      const nk = key(nid, nline);
      if (c < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, c);
        prev.set(nk, { from: k, move, change });
        queue.push([c, nid, nline]);
      }
    };
    // Along the line, both ways.
    const i = seq.indexOf(id);
    for (const j of [i - 1, i + 1]) {
      const nid = seq[j];
      if (nid === undefined) continue;
      const a = stationById.get(id)!;
      const b = stationById.get(nid)!;
      relax(nid, lineKey, cost + rideS(a, b), { line, from: a, to: b }, 0);
    }
    // Other lines here: same line code (a branch) is free, another line costs a change.
    for (const other of MTR_LINES) {
      if (other.key === lineKey || !(other.stations as readonly number[]).includes(id)) continue;
      const c = other.code === line.code ? 0 : TRANSFER_S;
      relax(id, other.key, cost + c, null, c);
    }
    // Same-name stations on other lines, and walkways.
    for (const ch of changesAt(id)) {
      for (const other of MTR_LINES) {
        if ((other.stations as readonly number[]).includes(ch.to)) {
          relax(ch.to, other.key, cost + ch.cost, null, ch.cost);
        }
      }
    }
  }
  if (!end) return null;
  const moves: Move[] = [];
  let changeS = 0;
  for (let k: string | undefined = end; k && prev.has(k);) {
    const p: { from: string; move: Move | null; change: number } = prev.get(k)!;
    if (p.move) moves.push(p.move);
    changeS += p.change;
    k = p.from;
  }
  moves.reverse();
  return {
    moves,
    rideS: moves.reduce((s, m) => s + rideS(m.from, m.to), 0),
    changeS,
  };
}

/** Station-to-station moves grouped into rides (one per line), with direction and stop count. */
function ridesOf(moves: Move[]) {
  const rides: { line: Line; stations: Station[] }[] = [];
  for (const m of moves) {
    const last = rides.at(-1);
    if (last && last.line.code === m.line.code) {
      last.stations.push(m.to);
      last.line = m.line; // the branch actually used last decides "towards"
    } else {
      rides.push({ line: m.line, stations: [m.from, m.to] });
    }
  }
  return rides;
}

/**
 * The terminus (or termini) in the direction of travel, for "towards …". Where branches share the
 * track (East Rail north of Sheung Shui splits to Lo Wu / Lok Ma Chau), every train that serves
 * the ride counts: "towards Lo Wu / Lok Ma Chau".
 */
function towards(line: Line, from: Station, to: Station): string {
  const names = new Set<string>();
  for (const branch of MTR_LINES) {
    const seq = branch.stations as readonly number[];
    if (branch.code !== line.code || !seq.includes(from.id) || !seq.includes(to.id)) continue;
    const forward = seq.indexOf(to.id) > seq.indexOf(from.id);
    names.add(stationById.get(forward ? seq.at(-1)! : seq[0]!)!.en);
  }
  return [...names].join(' / ');
}

const walkLeg = (a: LatLng, b: LatLng): TransitPlanLeg => {
  const d = haversineMeters(a, b) * WALK_DETOUR;
  return {
    kind: 'walk',
    duration_s: Math.round(d / WALK_MPS + STATION_ACCESS_S),
    distance_m: Math.round(d),
    geometry: [a, b],
    instructions: [],
  };
};

/**
 * Up to `limit` MTR journeys from `origin` to `destination` (nearest 3 stations at each end),
 * quickest first. Empty when there's no station within reach, or walking would be as quick.
 */
export function planMtrTrips(origin: LatLng, destination: LatLng, limit = 2): TransitPlan[] {
  const starts = nearestStations(origin);
  const ends = nearestStations(destination);
  // A journey slower than simply walking there isn't worth offering (e.g. CityU → Festival Walk).
  const directWalkS = (haversineMeters(origin, destination) * WALK_DETOUR) / WALK_MPS;
  const plans: { plan: TransitPlan; totalS: number }[] = [];
  for (const s of starts) {
    for (const e of ends) {
      if (s.station.en === e.station.en) continue;
      const j = findMtrJourney(s.station.id, e.station.id);
      if (!j || j.moves.length === 0) continue;
      const rides = ridesOf(j.moves);
      const legs: TransitPlanLeg[] = [walkLeg(origin, s.station)];
      rides.forEach((r, i) => {
        const from = r.stations[0]!;
        const to = r.stations.at(-1)!;
        const dist = r.stations
          .slice(1)
          .reduce((sum, st, k) => sum + haversineMeters(r.stations[k]!, st), 0);
        const stops = r.stations.length - 1;
        legs.push({
          kind: 'ride',
          vehicle: 'rail',
          operator: 'MTR',
          line: r.line.en,
          color: r.line.color,
          from_name: from.en,
          to_name: to.en,
          stops,
          // First train: half a headway. After a change the change time already includes waiting.
          wait_s: i === 0 ? FIRST_WAIT_S : TRANSFER_S,
          duration_s: Math.round(
            r.stations.slice(1).reduce((sum, st, k) => sum + rideS(r.stations[k]!, st), 0),
          ),
          distance_m: Math.round(dist),
          geometry: r.stations.map((st) => ({ lat: st.lat, lng: st.lng })),
          instruction: `Take the ${r.line.en} towards ${towards(r.line, from, to)} · ${stops} stop${stops === 1 ? '' : 's'} · get off at ${to.en}`,
          realtime: false,
          boarding: {
            stop_id: `mtr:${from.code}`,
            route: r.line.code,
            dest_codes: mtrUsefulDests(r.line.code, from.code, to.code),
          },
        });
      });
      legs.push(walkLeg(e.station, destination));
      const totalS = legs.reduce(
        (sum, l) => sum + l.duration_s + (l.kind === 'ride' ? l.wait_s : 0),
        0,
      );
      if (totalS >= directWalkS) continue;
      plans.push({
        totalS,
        plan: {
          id: `mtr-${s.station.code}-${e.station.code}`,
          legs,
          fare_hkd: null, // filled in by plan-trip from public.mtr_fares
          mtr: { from_id: s.station.id, to_id: e.station.id },
          source: 'mtr-open-data',
          estimated: ['transit_times', 'walk_legs'],
        },
      });
    }
  }
  // Quickest first; drop journeys that board and alight at the same pair of station names.
  const seen = new Set<string>();
  return plans
    .sort((a, b) => a.totalS - b.totalS)
    .filter(({ plan }) => {
      const rideKey = plan.legs
        .filter((l) => l.kind === 'ride')
        .map((l) => (l.kind === 'ride' ? `${l.line}:${l.from_name}>${l.to_name}` : ''))
        .join('|');
      if (seen.has(rideKey)) return false;
      seen.add(rideKey);
      return true;
    })
    .slice(0, limit)
    .map(({ plan }) => plan);
}
