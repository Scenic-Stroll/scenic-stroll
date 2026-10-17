// Smart routing evaluation (brief §9): for 5 demo trips at 10:00, 13:00 and 17:00, in heat and in
// rain, compare the fastest route with the "Best now" route, check the promises we make, and write a
// Markdown report for the pitch deck ("+2 min, 65 % less sun").
//
// Run: npm run eval:routing                 (uses the shade day from scripts/graph/data/shade.json)
//      npm run eval:routing -- 2026-10-24   (another day: shade times are moved to that day)
// Needs the local graph (npm run graph:build) and ideally shade (npm run graph:shade). The local
// graph is the same build that is loaded on the server, so the numbers match the app.
// Exits with code 1 if a check fails.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { formatDuration } from '../../shared/src/format.ts';
import { PRESETS } from '../../shared/src/presets.ts';
import { PROFILE_FOR_CONDITION, PROFILE_LABELS } from '../../shared/src/routing-profiles.ts';
import { DETOUR_CAP, planSmartRoutes } from '../../shared/src/smart-route.ts';
import type { SmartRouteOption } from '../../shared/src/smart-route-api.ts';
import { loadLocalGraph } from '../../scripts/graph/local-graph.mts';

const here = path.dirname(fileURLToPath(import.meta.url));
const { graph, sourceVersion, shadeDate } = loadLocalGraph();
const day = process.argv[2] ?? shadeDate ?? '2026-10-16';

const TRIPS: [string, string][] = [
  ['kot-exit-a1', 'cityu-mmw'],
  ['kot-exit-c1', 'cityu-yeung'],
  ['kot-exit-c1', 'cityu-ac2'],
  ['festival-walk', 'cityu-ac3'],
  ['kot-exit-a1', 'cityu-student-residence'],
];
const TIMES = ['10:00', '13:00', '17:00'];
const MODES = ['heat', 'rain'] as const;

const preset = (id: string) => {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown preset ${id}`);
  return p;
};
const short = (id: string) => preset(id).en.replace('Kowloon Tong ', '').replace('CityU ', '');

/** Metres in the sun (heat) or not under cover (rain): what each mode is trying to reduce. */
const exposureM = (o: SmartRouteOption, mode: (typeof MODES)[number]) =>
  mode === 'heat' ? o.exposure.sun_m : o.distance_m * (1 - o.pct_covered / 100);

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const pct = (x: number) => `${Math.round(x)} %`;

type Row = {
  trip: string;
  time: string;
  mode: (typeof MODES)[number];
  fastest: SmartRouteOption;
  best: SmartRouteOption;
  extraS: number;
  lessPct: number | null;
};
const rows: Row[] = [];
const checks: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });
let slowestMs = 0;
const stepFreeRows: { trip: string; option: SmartRouteOption | null }[] = [];

for (const [from, to] of TRIPS) {
  const trip = `${short(from)} → ${short(to)}`;
  const origin = preset(from).point;
  const destination = preset(to).point;

  for (const time of TIMES) {
    for (const mode of MODES) {
      const t0 = performance.now();
      const res = planSmartRoutes(graph, {
        origin,
        destination,
        profile: PROFILE_FOR_CONDITION[mode],
        departure: new Date(`${day}T${time}:00+08:00`),
        condition: mode,
        conditionSource: 'given',
      });
      slowestMs = Math.max(slowestMs, performance.now() - t0);
      const fastest = res.options.find((o) => o.roles.includes('fastest'));
      const best = res.options.find((o) => o.roles.includes('best_now'));
      if (res.status !== 'ok' || !fastest || !best) {
        check(`${trip} ${time} ${mode}: routes found`, false, `status ${res.status}`);
        continue;
      }
      const fe = exposureM(fastest, mode);
      const be = exposureM(best, mode);
      rows.push({
        trip,
        time,
        mode,
        fastest,
        best,
        extraS: best.duration_s - fastest.duration_s,
        lessPct: fe > 0 ? ((fe - be) / fe) * 100 : null,
      });

      // The promises (brief §9). "At least as good": when the fastest route is already the best
      // one for the weather, both are the same route.
      if (mode === 'heat') {
        check(
          `${trip} ${time} heat: coolest route at least as shaded as the fastest`,
          (best.pct_shaded ?? 0) >= (fastest.pct_shaded ?? 0),
          `${best.pct_shaded} % vs ${fastest.pct_shaded} %`,
        );
      } else {
        check(
          `${trip} ${time} rain: sheltered route at least as covered as the fastest`,
          best.pct_covered >= fastest.pct_covered,
          `${best.pct_covered} % vs ${fastest.pct_covered} %`,
        );
      }
      check(
        `${trip} ${time} ${mode}: "much longer" flag matches the ${DETOUR_CAP}× cap`,
        best.much_longer === best.duration_s > fastest.duration_s * DETOUR_CAP + 1,
        `${formatDuration(best.duration_s)} vs ${formatDuration(fastest.duration_s)}`,
      );
    }
  }

  // Step-free: never stairs or escalators; anything not known for sure is "unconfirmed".
  const sf = planSmartRoutes(graph, {
    origin,
    destination,
    profile: 'step_free',
    departure: new Date(`${day}T13:00:00+08:00`),
    condition: 'normal',
    conditionSource: 'given',
  });
  const option = sf.options.find((o) => o.roles.includes('requested')) ?? null;
  stepFreeRows.push({ trip, option });
  if (option) {
    check(
      `${trip}: step-free route has no stairs or escalators`,
      option.stairs === 0 && option.escalators === 0 && option.step_free !== 'no',
      `${option.stairs} stairs, ${option.escalators} escalators, verdict ${option.step_free}`,
    );
  }
}
check(
  'every plan computed in under 2 s',
  slowestMs < 2000,
  `slowest ${Math.round(slowestMs)} ms (server adds ~150 ms to load the graph)`,
);

// ---- the report ------------------------------------------------------------------------------

/** "+2 min", "+< 1 min" or "none" — minutes alone would hide a 25-second difference. */
const extraText = (extraS: number) =>
  extraS >= 30 ? `+${formatDuration(extraS)}` : extraS > 0 ? '+< 1 min' : 'none';

/**
 * Headline numbers over the trips where the weather route really differs from the fastest (when
 * they're the same route there's nothing to trade), plus the best case for the slide.
 */
const headline = (mode: (typeof MODES)[number]) => {
  const all = rows.filter((x) => x.mode === mode);
  const changed = all.filter((x) => x.best.id !== x.fastest.id && x.lessPct !== null);
  const bestCase = [...changed].sort((a, b) => (b.lessPct ?? 0) - (a.lessPct ?? 0))[0];
  return {
    changed: `${changed.length} of ${all.length}`,
    extra: extraText(median(changed.map((x) => x.extraS))),
    less: pct(median(changed.map((x) => x.lessPct!))),
    bestCase: bestCase
      ? `${bestCase.trip} at ${bestCase.time}: ${extraText(bestCase.extraS)}, ${pct(bestCase.lessPct!)} less`
      : 'none',
  };
};
const heat = headline('heat');
const rain = headline('rain');

const table = (mode: (typeof MODES)[number]) => {
  const best = PROFILE_LABELS[PROFILE_FOR_CONDITION[mode]].en;
  const what = mode === 'heat' ? 'in the sun' : 'uncovered';
  const lines = [
    `| Trip | Leave | Fastest | ${best} | Extra time | Less ${what} |`,
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const r of rows.filter((x) => x.mode === mode)) {
    const cell = (o: SmartRouteOption) =>
      `${formatDuration(o.duration_s)} · ${Math.round(exposureM(o, mode))} m ${what}` +
      (mode === 'heat' ? ` · ${o.pct_shaded ?? '–'} % shaded` : ` · ${o.pct_covered} % covered`);
    const same = r.best.id === r.fastest.id ? ' (same route)' : '';
    lines.push(
      `| ${r.trip} | ${r.time} | ${cell(r.fastest)} | ${cell(r.best)}${same} | ` +
        `${extraText(r.extraS)} | ` +
        `${r.lessPct === null ? '–' : pct(r.lessPct)} |`,
    );
  }
  return lines.join('\n');
};

const failed = checks.filter((c) => !c.ok);
const report = `# Smart routing evaluation — ${day}

Generated by \`npm run eval:routing\` on ${new Date().toISOString().slice(0, 10)} from the walking graph
(Lands Department 3D Pedestrian Network, data of ${sourceVersion}) with building and tree shade
computed for ${shadeDate ?? 'no day (shade not computed)'}. Same graph as the live \`smart-route\` function.
Shade is an **estimate** (building heights, trees and the sun's position); routes are computed, not yet
confirmed by walkers.

## Headline (for the pitch)

- **Heat — coolest vs fastest:** in ${heat.changed} trips the coolest route differs from the fastest;
  there it takes a median **${heat.extra}** for **${heat.less} less time in the sun**.
  Best case: ${heat.bestCase} sun.
- **Rain — sheltered vs fastest:** in ${rain.changed} trips the sheltered route differs; there it takes a
  median **${rain.extra}** for **${rain.less} less uncovered walking**. Best case: ${rain.bestCase} uncovered walking.
- In the other trips the fastest route is already the best one for the weather (often through
  Festival Walk), so nothing has to be traded.

## Heat (coolest route)

${table('heat')}

## Rain (sheltered route)

${table('rain')}

## Step-free (13:00)

| Trip | Route | Stairs / escalators | Step-free |
| --- | --- | --- | --- |
${stepFreeRows
  .map(({ trip, option: o }) =>
    o
      ? `| ${trip} | ${formatDuration(o.duration_s)} · ${o.distance_m} m · ${o.lifts} lift(s) | ${o.stairs} / ${o.escalators} | ${o.step_free === 'yes' ? 'yes' : 'unconfirmed (some parts unknown)'} |`
      : `| ${trip} | no step-free way in the map data | – | – |`,
  )
  .join('\n')}

## Checks — ${checks.length - failed.length} of ${checks.length} passed

${failed.length === 0 ? 'All checks passed.' : failed.map((c) => `- ✗ ${c.name}: ${c.detail}`).join('\n')}

<details><summary>All checks</summary>

${checks.map((c) => `- ${c.ok ? '✓' : '✗'} ${c.name} (${c.detail})`).join('\n')}

</details>
`;

const outDir = path.join(here, '..', 'results');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `routing-${day}.md`);
fs.writeFileSync(outFile, report);
console.log(
  `Heat (${heat.changed} changed): ${heat.extra}, ${heat.less} less sun · ` +
    `Rain (${rain.changed} changed): ${rain.extra}, ${rain.less} less uncovered`,
);
console.log(
  `Checks: ${checks.length - failed.length}/${checks.length} passed; slowest plan ${Math.round(slowestMs)} ms`,
);
for (const c of failed) console.log(`  ✗ ${c.name}: ${c.detail}`);
console.log(`Report: ${path.relative(process.cwd(), outFile)}`);
process.exit(failed.length === 0 ? 0 : 1);
