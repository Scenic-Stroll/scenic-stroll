// Tries smart routing on the local graph (scripts/graph/data/graph.json) for the demo trips, so
// you can see the effect of a weight change in routing-profiles.ts without deploying anything.
// Run: npm run graph:try          (after npm run graph:build; uses shade.json from graph:shade if there)
import type { ConditionMode } from '../../shared/src/conditions.ts';
import { formatDuration } from '../../shared/src/format.ts';
import { PRESETS } from '../../shared/src/presets.ts';
import type { RoutingProfile } from '../../shared/src/routing-profiles.ts';
import { planSmartRoutes } from '../../shared/src/smart-route.ts';

import { loadLocalGraph } from './local-graph.mts';

const { graph, shadeDate } = loadLocalGraph();
const day = shadeDate ?? '2026-10-16';

const point = (id: string) => PRESETS.find((p) => p.id === id)!.point;
const TRIPS: [string, string][] = [
  ['kot-exit-a1', 'cityu-mmw'],
  ['kot-exit-c1', 'cityu-yeung'],
  ['kot-exit-c1', 'cityu-ac2'],
  ['festival-walk', 'cityu-ac3'],
  ['kot-exit-a1', 'cityu-student-residence'],
];
const runs: { condition: ConditionMode; profile: RoutingProfile; time: string }[] = [
  { condition: 'normal', profile: 'fastest', time: `${day}T10:00:00+08:00` },
  { condition: 'rain', profile: 'sheltered', time: `${day}T13:00:00+08:00` },
  { condition: 'heat', profile: 'shaded', time: `${day}T10:00:00+08:00` },
  { condition: 'heat', profile: 'cool', time: `${day}T13:00:00+08:00` },
  { condition: 'normal', profile: 'step_free', time: `${day}T17:00:00+08:00` },
  { condition: 'night', profile: 'fastest', time: `${day}T23:59:00+08:00` },
];

for (const [from, to] of TRIPS) {
  console.log(`\n${from} → ${to}`);
  for (const run of runs) {
    const t0 = performance.now();
    const res = planSmartRoutes(graph, {
      origin: point(from),
      destination: point(to),
      profile: run.profile,
      departure: new Date(run.time),
      condition: run.condition,
      conditionSource: 'given',
    });
    const ms = Math.round(performance.now() - t0);
    const head = `  [${run.condition}/${run.profile} ${run.time.slice(11, 16)}] ${res.status} in ${ms} ms`;
    if (res.status !== 'ok') {
      console.log(head);
      continue;
    }
    console.log(
      head + (res.unavailable.length ? ` (no route: ${res.unavailable.join(', ')})` : ''),
    );
    for (const o of res.options) {
      console.log(
        `    ${o.roles.join('+').padEnd(26)} ${formatDuration(o.duration_s).padStart(6)} ${String(o.distance_m).padStart(5)} m  covered ${String(o.pct_covered).padStart(3)}%  shaded ${o.pct_shaded === null ? '  –' : String(o.pct_shaded).padStart(3)}%  indoor ${String(o.pct_indoor).padStart(3)}%  stairs ${o.stairs} lifts ${o.lifts}  step-free ${o.step_free}${o.much_longer ? '  MUCH LONGER' : ''}`,
      );
    }
  }
}

// Directions for one trip, to read through.
const sample = planSmartRoutes(graph, {
  origin: point('kot-exit-c1'),
  destination: point('cityu-yeung'),
  profile: 'sheltered',
  departure: new Date('2026-10-16T13:00:00+08:00'),
  condition: 'rain',
  conditionSource: 'given',
});
const o = sample.options[0]!;
console.log(`\nDirections, Exit C1 → YEUNG (sheltered): ${o.explanation.text}`);
for (const s of o.steps)
  console.log(`  - ${s.instruction}${s.distance_m ? ` (${s.distance_m} m)` : ''}`);
