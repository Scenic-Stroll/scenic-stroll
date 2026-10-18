// Multimodal evaluation (brief §8): for the brief's trip pairs, leaving now and at 08:30 / 18:00
// on the next weekday, ask the live plan-trip function and write a Markdown table per pair — best
// time per mode, cost, CO₂, walking minutes — plus the one-line comparison for the pitch deck
// ("MTR is within 2 min of a taxi and saves ~650 g CO₂").
//
// Run (online):  npm run eval:multimodal
// Writes eval/results/multimodal-<date>.md. Each run creates one anonymous test user (harmless).
// Without the Google key, car times are typical (ORS) and transit is our MTR planner — the report
// says so. Trips planned ahead get estimated waits; only "now" uses live MTR departures.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FUNCTIONS } from '../../shared/src/api.ts';
import { formatDuration } from '../../shared/src/format.ts';
import { PRESETS } from '../../shared/src/presets.ts';
import { withRushHour } from '../../shared/src/rush-hour.ts';
import {
  PlanTripResponseSchema,
  type PlanTripResponse,
  type TripOption,
} from '../../shared/src/trip-schema.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const env = fs.readFileSync(path.join(root, 'app', '.env'), 'utf8');
const read = (key: string) => env.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim();
const url = read('EXPO_PUBLIC_SUPABASE_URL');
const key = read('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
if (!url || !key) throw new Error('app/.env is missing the Supabase URL or publishable key');

const preset = (id: string) => PRESETS.find((p) => p.id === id)!.point;
const CITYU = preset('cityu-mmw');
const PAIRS: {
  name: string;
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
}[] = [
  { name: 'Kowloon Tong Exit A1 → CityU MMW', from: preset('kot-exit-a1'), to: CITYU },
  { name: 'CityU → Mong Kok', from: CITYU, to: { lat: 22.3193, lng: 114.1694 } },
  { name: 'CityU → Tsim Sha Tsui', from: CITYU, to: { lat: 22.2973, lng: 114.1722 } },
  { name: 'CityU → HKU', from: CITYU, to: { lat: 22.283, lng: 114.1371 } },
  { name: 'CityU → CUHK', from: CITYU, to: { lat: 22.4196, lng: 114.2068 } },
];

/** Next Monday–Friday (Hong Kong date) at hh:mm, as ISO with +08:00. */
function nextWeekday(hhmm: string): string {
  const d = new Date(Date.now() + 8 * 3600_000);
  do d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return `${d.toISOString().slice(0, 10)}T${hhmm}:00+08:00`;
}
const TIMES: { label: string; departAt?: string }[] = [
  { label: 'now' },
  { label: `${nextWeekday('08:30').slice(0, 10)} 08:30`, departAt: nextWeekday('08:30') },
  { label: `${nextWeekday('18:00').slice(0, 10)} 18:00`, departAt: nextWeekday('18:00') },
];

const signup = await fetch(`${url}/auth/v1/signup`, {
  method: 'POST',
  headers: { apikey: key, 'Content-Type': 'application/json' },
  body: '{}',
});
const session = await signup.json();
if (!session.access_token) throw new Error(`Anonymous sign-in failed (HTTP ${signup.status})`);

async function planTrip(from: object, to: object, departAt?: string): Promise<PlanTripResponse> {
  const res = await fetch(`${url}/functions/v1/${FUNCTIONS.planTrip}`, {
    method: 'POST',
    headers: {
      apikey: key!,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ origin: from, destination: to, depart_at: departAt }),
    signal: AbortSignal.timeout(30_000), // a stuck call shouldn't hang the whole report
  });
  if (!res.ok) throw new Error(`plan-trip HTTP ${res.status}: ${await res.text()}`);
  return PlanTripResponseSchema.parse(await res.json());
}

const MODE_NAMES: Record<string, string> = {
  walk: 'Walk',
  transit: 'MTR',
  car: 'Car',
  taxi: 'Taxi',
};
const cost = (o: TripOption) =>
  o.cost_range_hkd
    ? `HK$${Math.round(o.cost_range_hkd[0])}–${Math.round(o.cost_range_hkd[1])}`
    : o.cost_hkd === null
      ? '–'
      : o.cost_hkd === 0
        ? 'free'
        : `HK$${o.cost_hkd.toFixed(1)}`;
const bestOf = (plan: PlanTripResponse, mode: string) =>
  plan.options.filter((o) => o.mode === mode).sort((a, b) => a.total_s - b.total_s)[0];

/** "MTR is 4 min slower than a car and saves ~650 g CO₂" — the pitch line. */
function pitchLine(plan: PlanTripResponse): string {
  const drive = ['car', 'taxi'].map((m) => bestOf(plan, m)).filter(Boolean) as TripOption[];
  const green = ['walk', 'transit'].map((m) => bestOf(plan, m)).filter(Boolean) as TripOption[];
  const fastDrive = drive.sort((a, b) => a.total_s - b.total_s)[0];
  const fastGreen = green.sort((a, b) => a.total_s - b.total_s)[0];
  if (!fastDrive || !fastGreen) return '';
  const diff = fastGreen.total_s - fastDrive.total_s;
  const vs = `${MODE_NAMES[fastDrive.mode]!.toLowerCase()}`;
  const time =
    diff <= 30
      ? `is as quick as (or quicker than) a ${vs}`
      : `is ${formatDuration(diff)} slower than a ${vs}`;
  return `${MODE_NAMES[fastGreen.mode]} ${time} and saves ~${fastDrive.co2_g - fastGreen.co2_g} g CO₂`;
}

function table(plan: PlanTripResponse): string[] {
  const rows = ['| Mode | Best time | Cost | CO₂ | Walking | Notes |', '|---|---|---|---|---|---|'];
  for (const mode of ['walk', 'transit', 'car', 'taxi']) {
    const o = bestOf(plan, mode);
    if (!o) {
      const why = plan.unavailable.find((u) => u.mode === mode)?.reason ?? 'not offered';
      rows.push(`| ${MODE_NAMES[mode]} | – | – | – | – | ${why} |`);
      continue;
    }
    const notes = [
      o.title,
      o.recommended ? 'green nudge' : null,
      o.legs.some((l) => l.live_departures?.length) ? 'live MTR departure' : null,
      o.estimated.includes('traffic') ? 'typical traffic' : null,
      o.estimated.includes('simulated_traffic') ? 'simulated jam' : null,
    ]
      .filter(Boolean)
      .join(' · ');
    rows.push(
      `| ${MODE_NAMES[mode]} | ${formatDuration(o.total_s)} | ${cost(o)} | ${o.co2_g} g | ${formatDuration(o.walking_s)} | ${notes} |`,
    );
  }
  return rows;
}

const day = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const out: string[] = [
  `# Multimodal evaluation — ${day}`,
  '',
  'Live answers from the `plan-trip` Edge Function. Car/taxi times are **typical traffic** (OpenRouteService)',
  'until the Google key is set; public transport is our MTR planner (ride times estimated from distance; the',
  '"now" run uses live MTR Next Train departures). Taxi = official urban meter, tolls not included. CO₂ =',
  'estimates (DECISIONS D31–D34). "Rush hour (simulated)" = the demo switch: driving × 2.5.',
  '',
];
const pitch: string[] = [];
for (const pair of PAIRS) {
  out.push(`## ${pair.name}`, '');
  for (const time of TIMES) {
    const plan = await planTrip(pair.from, pair.to, time.departAt);
    out.push(`**Leaving ${time.label}** — ${pitchLine(plan)}`, '', ...table(plan), '');
    if (time.label.endsWith('18:00')) {
      const rush = withRushHour(plan);
      out.push(
        `**${time.label}, rush hour (simulated)** — ${pitchLine(rush)}`,
        '',
        ...table(rush),
        '',
      );
      pitch.push(`- ${pair.name}, 18:00 in a jam: ${pitchLine(rush)}`);
    }
    console.log(`${pair.name} · ${time.label}: ${pitchLine(plan)}`); // progress
  }
}
out.push('## For the pitch deck', '', ...pitch, '');
const file = path.join(root, 'eval', 'results', `multimodal-${day}.md`);
fs.writeFileSync(file, out.join('\n'));
console.log(`\nWrote ${path.relative(root, file)}`);
