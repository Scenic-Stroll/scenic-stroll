/**
 * Turns a found route into what the app shows: line, time, distance, % covered / indoor /
 * air-conditioned, counts of stairs and lifts, the step-free verdict, the segment strip,
 * plain-English directions and a one-sentence explanation built from those facts by a template.
 */
import type { RoutingEdge } from './graph-export.ts';
import { formatDuration } from './format.ts';
import type { FoundRoute, RouteLeg } from './router.ts';
import { edgeTimeS, FLOOR_HEIGHT_M } from './routing-profiles.ts';
import type { LatLng } from './schemas.ts';
import type { SegmentKind } from './segments.ts';

export type StepFreeVerdict = 'yes' | 'unconfirmed' | 'no';

export type RouteSummary = {
  coordinates: LatLng[];
  distance_m: number;
  duration_s: number;
  pct_covered: number;
  pct_indoor: number;
  pct_air_conditioned: number;
  stairs: number;
  lifts: number;
  escalators: number;
  crossings: number;
  max_slope_pct: number;
  step_free: StepFreeVerdict;
  segments: SegmentKind[];
  steps: { instruction: string; distance_m: number; duration_s: number }[];
  data_sources: string[];
  /** Edge ids, to compare routes (overlap) — not sent to the app. */
  edgeIds: number[];
};

/** A start/end this far from the path is more than "where you tapped vs the door": can't vouch for it. */
export const ACCESS_UNCONFIRMED_M = 60;

const legLine = (leg: RouteLeg) => (leg.forward ? leg.edge.line : [...leg.edge.line].reverse());

/**
 * Step-free verdict, conservatively: any "no" edge → no; any "unknown" edge, or a long unmapped walk
 * at either end → unconfirmed; otherwise yes. (Never say "step-free" unless every metre is known.)
 */
export function stepFreeVerdict(route: FoundRoute): StepFreeVerdict {
  if (route.legs.some((l) => l.edge.step_free === 'no')) return 'no';
  if (route.legs.some((l) => l.edge.step_free === 'unknown')) return 'unconfirmed';
  if (
    route.startAccess.distM > ACCESS_UNCONFIRMED_M ||
    route.endAccess.distM > ACCESS_UNCONFIRMED_M
  ) {
    return 'unconfirmed';
  }
  return 'yes';
}

function segmentOf(e: RoutingEdge): SegmentKind {
  switch (e.kind) {
    case 'lift':
    case 'escalator':
    case 'stairs':
    case 'footbridge':
      return e.kind;
    case 'subway':
      return 'underpass';
    case 'indoor_corridor':
    case 'mall':
      return 'indoor';
    default:
      return e.indoor ? 'indoor' : 'outdoor';
  }
}

/** Ignore indoor/outdoor stretches shorter than this in the strip (a 3 m kerb isn't news). */
const STRIP_MIN_M = 15;

function buildStrip(legs: RouteLeg[]): SegmentKind[] {
  // Runs of the same segment kind, with their length.
  const runs: { kind: SegmentKind; m: number }[] = [];
  for (const { edge } of legs) {
    const kind = segmentOf(edge);
    const last = runs.at(-1);
    if (last?.kind === kind) last.m += edge.length_m;
    else runs.push({ kind, m: edge.length_m });
  }
  const strip: SegmentKind[] = [];
  for (const r of runs) {
    const short = (r.kind === 'outdoor' || r.kind === 'indoor') && r.m < STRIP_MIN_M;
    if (short || strip.at(-1) === r.kind) continue;
    strip.push(r.kind);
  }
  return strip.length > 0 ? strip : ['outdoor'];
}

// ---- directions ----------------------------------------------------------------------------

const GENERIC_NAMES = new Set([
  'footway',
  'crossing',
  'lift',
  'subway',
  'footbridge',
  'staircase',
  'ramp',
  'escalator',
]);
const NAME_SUFFIX =
  / (Crossing|Staircase|Footbridge|Subway|Ramp|Lift|Escalator|RunIn|Traffic Island|Footway)$/i;

/** "TAT CHEE AVENUE Subway" → "Tat Chee Avenue"; "Footway" → null. */
export function cleanName(name: string | null): string | null {
  if (!name) return null;
  let n = name.trim();
  while (NAME_SUFFIX.test(n)) n = n.replace(NAME_SUFFIX, '').trim();
  n = n.replace(/\b[A-Z]{2,}\b/g, (w) => w[0] + w.slice(1).toLowerCase()); // SHOUTING → Title
  n = n.replace(/ (Of|The|And) /g, (w) => w.toLowerCase()); // "City University Of" → "of"
  return n && !GENERIC_NAMES.has(n.toLowerCase()) ? n : null;
}

/** Names that are streets ("walk along …"); anything else is a place ("walk through …"). */
const STREET_WORDS = /\b(Road|Street|Avenue|Lane|Drive|Path|Terrace|Crescent|Way|Rise|Hill)$/i;

/** Compass bearing (degrees) from a to b. */
function bearing(a: LatLng, b: LatLng): number {
  const toRad = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * toRad) * Math.cos(b.lat * toRad);
  const x =
    Math.cos(a.lat * toRad) * Math.sin(b.lat * toRad) -
    Math.sin(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.cos((b.lng - a.lng) * toRad);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** "left" / "right" / null for a change of direction between two headings. */
function turn(from: number, to: number): 'left' | 'right' | null {
  const d = ((to - from + 540) % 360) - 180;
  if (d > 35) return 'right';
  if (d < -35) return 'left';
  return null;
}

type StepGroup = {
  kind: RoutingEdge['kind'];
  name: string | null;
  legs: RouteLeg[];
  m: number;
  s: number;
};

/** Directions: one step per run of the same kind and street name. */
function buildSteps(legs: RouteLeg[], times: number[]) {
  const groups: StepGroup[] = [];
  legs.forEach((leg, i) => {
    const kind = leg.edge.kind === 'mall' ? 'indoor_corridor' : leg.edge.kind;
    const name = cleanName(leg.edge.name_en);
    const last = groups.at(-1);
    // Same kind and same (or no) name = one step: a flight of stairs drawn in 3 parts is one flight.
    const sameStep = last && last.kind === kind && (last.name === name || !name || !last.name);
    if (last && sameStep) {
      last.legs.push(leg);
      last.m += leg.edge.length_m;
      last.s += times[i]!;
      last.name ??= name;
    } else {
      groups.push({ kind, name, legs: [leg], m: leg.edge.length_m, s: times[i]! });
    }
  });

  return groups.map((g, i) => {
    const first = g.legs[0]!;
    const lastLeg = g.legs.at(-1)!;
    const zStart = first.forward ? first.edge.z_from : first.edge.z_to;
    const zEnd = lastLeg.forward ? lastLeg.edge.z_to : lastLeg.edge.z_from;
    const upDown = zEnd >= zStart ? 'up' : 'down';
    const level = lastLeg.forward ? lastLeg.edge.level_to : lastLeg.edge.level_from;

    let turnWord: 'left' | 'right' | null = null;
    const prev = groups[i - 1];
    if (prev) {
      const pl = legLine(prev.legs.at(-1)!);
      const nl = legLine(first);
      if (pl.length >= 2 && nl.length >= 2)
        turnWord = turn(bearing(pl.at(-2)!, pl.at(-1)!), bearing(nl[0]!, nl[1]!));
    }
    const lead = turnWord ? `Turn ${turnWord} and ` : '';
    const via = g.name ? ` (${g.name})` : '';
    let text: string;
    switch (g.kind) {
      case 'lift': {
        const floors = Math.max(1, Math.round(Math.abs(zEnd - zStart) / FLOOR_HEIGHT_M));
        text = `Take the lift ${upDown} ${floors} floor${floors > 1 ? 's' : ''}${level ? ` to ${level}` : ''}`;
        break;
      }
      case 'escalator':
        text = `Take the escalator ${upDown}${via}`;
        break;
      case 'stairs':
        text = `Take the stairs ${upDown}`;
        break;
      case 'crossing':
        text = g.name ? `Cross ${g.name}` : 'Cross the road';
        break;
      case 'footbridge':
        text = `${lead}take the footbridge${via}`;
        break;
      case 'subway':
        text = `${lead}go through the subway${via}`;
        break;
      case 'indoor_corridor':
        text = `${lead}walk indoors${g.name ? ` through ${g.name}` : ''}`;
        break;
      default:
        if (!g.name)
          text = turnWord ? `Turn ${turnWord}` : i === 0 ? 'Head off' : 'Continue straight';
        else if (STREET_WORDS.test(g.name)) {
          text = turnWord ? `Turn ${turnWord} onto ${g.name}` : `Walk along ${g.name}`;
        } else text = `${lead}walk through ${g.name}`;
    }
    text = text.charAt(0).toUpperCase() + text.slice(1);
    return { instruction: text, distance_m: Math.round(g.m), duration_s: Math.round(g.s) };
  });
}

// ---- the summary ---------------------------------------------------------------------------

export function summarizeRoute(
  route: FoundRoute,
  origin: LatLng,
  destination: LatLng,
): RouteSummary {
  const { legs } = route;
  const coordinates: LatLng[] = [origin];
  for (const leg of legs) {
    for (const p of legLine(leg)) {
      const last = coordinates.at(-1)!;
      if (last.lat !== p.lat || last.lng !== p.lng) coordinates.push(p);
    }
  }
  if (legs.length === 0) coordinates.push(route.startAccess.node);
  coordinates.push(destination);

  const access = route.startAccess.distM + route.endAccess.distM;
  const pathM = legs.reduce((s, l) => s + l.edge.length_m, 0);
  const total = pathM + access;
  const pct = (f: (e: RoutingEdge) => boolean) =>
    total > 0
      ? Math.round(
          (legs.filter((l) => f(l.edge)).reduce((s, l) => s + l.edge.length_m, 0) / total) * 100,
        )
      : 0;
  const count = (kind: RoutingEdge['kind']) => {
    // A flight of stairs drawn as 3 segments is still one flight: count runs, not edges.
    let n = 0;
    legs.forEach((l, i) => {
      if (l.edge.kind === kind && legs[i - 1]?.edge.kind !== kind) n++;
    });
    return n;
  };

  // Directions; the short walks to/from the path are added to the first and last step.
  const steps = buildSteps(
    legs,
    legs.map((l) => edgeTimeS(l.edge)),
  );
  if (steps.length > 0) {
    steps[0]!.distance_m += Math.round(route.startAccess.distM);
    steps.at(-1)!.distance_m += Math.round(route.endAccess.distM);
  }
  steps.push({ instruction: 'Arrive at your destination', distance_m: 0, duration_s: 0 });

  return {
    coordinates,
    distance_m: Math.round(total),
    duration_s: Math.round(route.timeS),
    pct_covered: pct((e) => e.covered || e.indoor),
    pct_indoor: pct((e) => e.indoor),
    pct_air_conditioned: pct((e) => e.air_conditioned),
    stairs: count('stairs'),
    lifts: count('lift'),
    escalators: count('escalator'),
    crossings: count('crossing'),
    max_slope_pct: Math.max(
      0,
      ...legs
        .filter((l) => !['lift', 'stairs', 'escalator'].includes(l.edge.kind))
        .map((l) => l.edge.slope_pct),
    ),
    step_free: stepFreeVerdict(route),
    segments: buildStrip(legs),
    steps,
    data_sources: [...new Set(legs.map((l) => l.edge.data_source))],
    edgeIds: legs.map((l) => l.edge.id),
  };
}

/** Share of route `a`'s length that is also in route `b` (0–1). Used to drop near-duplicates. */
export function overlapRatio(a: FoundRoute, b: FoundRoute): number {
  const inB = new Set(b.legs.map((l) => l.edge.id));
  const lenA = a.legs.reduce((s, l) => s + l.edge.length_m, 0);
  if (lenA === 0) return 1;
  return a.legs.filter((l) => inB.has(l.edge.id)).reduce((s, l) => s + l.edge.length_m, 0) / lenA;
}

/** Longest named indoor stretch, e.g. "Festival Walk LG1" — for the explanation. */
function mainIndoorName(route: FoundRoute): string | null {
  const byName = new Map<string, number>();
  for (const { edge } of route.legs) {
    const n = cleanName(edge.name_en);
    if (edge.indoor && n) byName.set(n, (byName.get(n) ?? 0) + edge.length_m);
  }
  return [...byName.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/**
 * The explanation sentence, built only from facts (no language model):
 * "Mostly covered: 72% under cover or indoors, through Festival Walk LG1. 1 min longer than the fastest."
 */
export function explain(
  s: RouteSummary,
  route: FoundRoute,
  fastestS: number | null,
): { text: string; facts: Record<string, number | string | null> } {
  const indoorName = mainIndoorName(route);
  const parts: string[] = [];
  if (s.pct_covered >= 60) parts.push(`Mostly covered: ${s.pct_covered}% under cover or indoors`);
  else if (s.pct_covered >= 25)
    parts.push(`Partly covered: ${s.pct_covered}% under cover or indoors`);
  else parts.push(`Mostly in the open: ${s.pct_covered}% covered`);
  if (indoorName) parts[0] += `, through ${indoorName}`;
  const sentences = [`${parts[0]}.`];

  const extra = fastestS === null ? null : s.duration_s - fastestS;
  if (extra !== null && extra >= 30)
    sentences.push(`${formatDuration(extra)} longer than the fastest route.`);
  else if (extra !== null) sentences.push('About as quick as the fastest route.');

  if (s.step_free === 'yes') sentences.push('No stairs or escalators.');
  else if (s.step_free === 'unconfirmed')
    sentences.push('Step-free access not confirmed for every part.');
  else if (s.stairs > 0) sentences.push(`${s.stairs} set${s.stairs > 1 ? 's' : ''} of stairs.`);

  return {
    text: sentences.join(' '),
    facts: {
      pct_covered: s.pct_covered,
      pct_indoor: s.pct_indoor,
      pct_air_conditioned: s.pct_air_conditioned,
      stairs: s.stairs,
      lifts: s.lifts,
      crossings: s.crossings,
      extra_s_vs_fastest: extra,
      via_indoor: indoorName,
      step_free: s.step_free,
    },
  };
}
