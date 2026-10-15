/**
 * Finds the cheapest walk through the walking graph for a routing profile (Dijkstra's algorithm).
 *
 * - Start and end: we don't snap to ONE nearest point. The start connects to the few nearest graph
 *   nodes (walking there in a straight line), and so does the end, and the search picks the best
 *   combination. Why: the node nearest a building's centre can be behind steps, while the step-free
 *   entrance is 40 m further — the search finds it by itself.
 * - Time matters: an indoor link is only used if it is open at the moment you'd reach it
 *   (departure time + walking time so far).
 * - One-way edges (escalators) are only walked the allowed way.
 */
import { haversineMeters } from './geo.ts';
import type { RoutingEdge, RoutingNode, WalkingGraph } from './graph-export.ts';
import { isOpenAt } from './opening-hours.ts';
import { edgeCost, edgeTimeS, WALK_SPEED_MPS, type RoutingProfile } from './routing-profiles.ts';
import type { LatLng } from './schemas.ts';

/** The graph plus lookups the router needs (built once, reused for every request). */
export type PreparedGraph = WalkingGraph & {
  /** For each node: the edges you can leave it by, and whether that's along the drawn direction. */
  out: { edge: RoutingEdge; forward: boolean }[][];
  /** Node ids by ~50 m grid cell, for "nodes near this point". */
  grid: Map<string, number[]>;
  /** true if any outdoor edge touches the node (a way out when indoor links are closed). */
  outdoor: boolean[];
};

const CELL_DEG = 0.0005; // ≈ 50 m
const cellKey = (lng: number, lat: number) =>
  `${Math.floor(lng / CELL_DEG)},${Math.floor(lat / CELL_DEG)}`;

/**
 * Builds the lookups. Node ids are renumbered 0…n-1 (edges updated to match) so they can index
 * arrays. Why: the database keeps the build script's ids, which have gaps where disconnected scraps
 * were left out.
 */
export function prepareGraph(input: WalkingGraph): PreparedGraph {
  const index = new Map(input.nodes.map((n, i) => [n.id, i]));
  const graph: WalkingGraph = {
    ...input,
    nodes: input.nodes.map((n, i) => ({ ...n, id: i })),
    edges: input.edges
      .filter((e) => index.has(e.source) && index.has(e.target))
      .map((e) => ({ ...e, source: index.get(e.source)!, target: index.get(e.target)! })),
  };
  const out: PreparedGraph['out'] = graph.nodes.map(() => []);
  for (const edge of graph.edges) {
    out[edge.source]?.push({ edge, forward: true });
    if (edge.bidirectional) out[edge.target]?.push({ edge, forward: false });
  }
  const grid = new Map<string, number[]>();
  for (const n of graph.nodes) {
    const key = cellKey(n.lng, n.lat);
    const list = grid.get(key);
    if (list) list.push(n.id);
    else grid.set(key, [n.id]);
  }
  const outdoor = graph.nodes.map(() => false);
  for (const e of graph.edges) {
    if (!e.indoor) outdoor[e.source] = outdoor[e.target] = true;
  }
  return { ...graph, out, grid, outdoor };
}

/** Nodes within `maxM` of a point, nearest first (at most `limit`). */
export function nearbyNodes(
  g: PreparedGraph,
  p: LatLng,
  maxM: number,
  limit: number,
): { node: RoutingNode; distM: number }[] {
  const reach = Math.ceil(maxM / 50) + 1;
  const cx = Math.floor(p.lng / CELL_DEG);
  const cy = Math.floor(p.lat / CELL_DEG);
  const found: { node: RoutingNode; distM: number }[] = [];
  for (let dx = -reach; dx <= reach; dx++) {
    for (let dy = -reach; dy <= reach; dy++) {
      for (const id of g.grid.get(`${cx + dx},${cy + dy}`) ?? []) {
        const node = g.nodes[id]!;
        const distM = haversineMeters(p, node);
        if (distM <= maxM) found.push({ node, distM });
      }
    }
  }
  return found.sort((a, b) => a.distM - b.distM).slice(0, limit);
}

/** How far from a graph node a start/end may be, and how many nearby nodes we try. */
export const ACCESS_MAX_M = 250;
export const ACCESS_CANDIDATES = 12;
/**
 * Only nodes at most this much further than the NEAREST node are start/end candidates. Why: the
 * straight walk to the path is unmapped (it could cross a building or a staircase); it's only there to
 * get from where you tapped to the path, not to skip part of the trip.
 */
export const ACCESS_SLACK_M = 60;
/** Straight-line access walks are a bit longer in reality. */
const ACCESS_DETOUR = 1.2;
/** …and cost extra, so the search prefers mapped paths over unmapped straight lines. */
const ACCESS_COST_FACTOR = 3;

export type RouteLeg = { edge: RoutingEdge; forward: boolean };

export type FoundRoute = {
  legs: RouteLeg[];
  /** Straight-line walks from the start point to the first node / last node to the end point. */
  startAccess: { node: RoutingNode; distM: number };
  endAccess: { node: RoutingNode; distM: number };
  timeS: number;
  cost: number;
};

export type RouteQuery = {
  origin: LatLng;
  destination: LatLng;
  profile: RoutingProfile;
  departure: Date;
  /** Extra cost multipliers per edge id — used to find a DIFFERENT alternative route. */
  penalties?: Map<number, number>;
};

/** Tiny binary min-heap of [cost, node]. */
class MinHeap {
  private items: [number, number][] = [];
  get size() {
    return this.items.length;
  }
  push(item: [number, number]) {
    const a = this.items;
    a.push(item);
    for (let i = a.length - 1; i > 0;) {
      const parent = (i - 1) >> 1;
      if (a[parent]![0] <= a[i]![0]) break;
      [a[parent], a[i]] = [a[i]!, a[parent]!];
      i = parent;
    }
  }
  pop(): [number, number] {
    const a = this.items;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l]![0] < a[m]![0]) m = l;
        if (r < a.length && a[r]![0] < a[m]![0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i]!, a[m]!];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Start/end candidates: the nearest nodes (within ACCESS_SLACK_M of the very nearest). If all of
 * those are indoor-only, also the nearest OUTDOOR nodes. Why: a point inside Festival Walk has only
 * indoor nodes nearby; at 2 am they're all closed, and without an outdoor option there'd be no route.
 */
function accessCandidates(g: PreparedGraph, p: LatLng) {
  const near = nearbyNodes(g, p, ACCESS_MAX_M, ACCESS_CANDIDATES * 4);
  if (near.length === 0) return [];
  const limit = near[0]!.distM + ACCESS_SLACK_M;
  const nearest = near.filter((c) => c.distM <= limit).slice(0, ACCESS_CANDIDATES);
  if (nearest.some((c) => g.outdoor[c.node.id])) return nearest;
  const outdoor = near.filter((c) => g.outdoor[c.node.id]).slice(0, ACCESS_CANDIDATES / 2);
  return [...nearest, ...outdoor];
}

/** Real walking time of a straight access walk. */
const accessTimeS = (distM: number) => (distM * ACCESS_DETOUR) / WALK_SPEED_MPS;
/** Its routing cost (see ACCESS_COST_FACTOR). */
const accessCost = (distM: number) => accessTimeS(distM) * ACCESS_COST_FACTOR;

/** The cheapest route for the query, or null if there is none (or a point is off the graph). */
export function findRoute(g: PreparedGraph, q: RouteQuery): FoundRoute | null {
  const starts = accessCandidates(g, q.origin);
  const ends = accessCandidates(g, q.destination);
  if (starts.length === 0 || ends.length === 0) return null;
  const endAccess = new Map(ends.map((e) => [e.node.id, e]));

  const cost = new Map<number, number>();
  const time = new Map<number, number>();
  const via = new Map<number, RouteLeg>(); // how we reached each node
  const startOf = new Map<number, { node: RoutingNode; distM: number }>(); // which start it came from
  const heap = new MinHeap();
  for (const s of starts) {
    const c = accessCost(s.distM);
    if (c < (cost.get(s.node.id) ?? Infinity)) {
      cost.set(s.node.id, c);
      time.set(s.node.id, accessTimeS(s.distM));
      startOf.set(s.node.id, s);
      heap.push([c, s.node.id]);
    }
  }

  let best: { node: number; total: number } | null = null;
  const done = new Set<number>();
  while (heap.size > 0) {
    const [c, u] = heap.pop();
    if (done.has(u)) continue;
    done.add(u);
    if (best && c >= best.total) break; // nothing left can beat the best finish

    const finish = endAccess.get(u);
    if (finish) {
      const total = c + accessCost(finish.distM);
      if (!best || total < best.total) best = { node: u, total };
    }

    const arrival = new Date(q.departure.getTime() + time.get(u)! * 1000);
    for (const leg of g.out[u] ?? []) {
      const v = leg.forward ? leg.edge.target : leg.edge.source;
      if (done.has(v)) continue;
      if (!isOpenAt(leg.edge.opening_hours, arrival)) continue; // closed when we'd get there
      const edgeC = edgeCost(leg.edge, q.profile);
      if (edgeC === null) continue; // e.g. stairs on a step-free route
      const nc = c + edgeC * (q.penalties?.get(leg.edge.id) ?? 1);
      if (nc < (cost.get(v) ?? Infinity)) {
        cost.set(v, nc);
        time.set(v, time.get(u)! + edgeTimeS(leg.edge));
        via.set(v, leg);
        startOf.set(v, startOf.get(u)!);
        heap.push([nc, v]);
      }
    }
  }
  if (!best) return null;

  // Walk back from the finish to the start.
  const legs: RouteLeg[] = [];
  for (let n = best.node; via.has(n);) {
    const leg = via.get(n)!;
    legs.push(leg);
    n = leg.forward ? leg.edge.source : leg.edge.target;
  }
  legs.reverse();
  const endA = endAccess.get(best.node)!;
  return {
    legs,
    startAccess: startOf.get(best.node)!,
    endAccess: endA,
    timeS: time.get(best.node)! + accessTimeS(endA.distM),
    cost: best.total,
  };
}
