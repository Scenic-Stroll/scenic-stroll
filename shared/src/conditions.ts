/**
 * Live walking conditions: Hong Kong Observatory (HKO) weather + warnings + the sun's position,
 * turned into ONE "condition mode" that tells the router what matters most right now.
 *
 * Everything here is plain logic (no network), so it is unit-tested and shared by the
 * `conditions` Edge Function, the future `smart-route` function and the app.
 *
 * Never blocks the user: if HKO is down we use the last cached answer, then time-of-day defaults.
 */
import { z } from 'zod';

import { sunPosition } from './sun.ts';

/**
 * Where we read the sun: the demo-area centre between CityU and Festival Walk. Same point as
 * DEMO_CENTER in presets.ts (a test keeps them equal). Not imported from there so the Edge Function
 * bundle stays small.
 */
export const CONDITIONS_POINT = { lat: 22.3365, lng: 114.1735 } as const;

// ---- condition modes ---------------------------------------------------------------------

export const CONDITION_MODES = [
  'normal',
  'rain',
  'heat',
  'night',
  'typhoon_or_black_rain',
] as const;
export const ConditionModeSchema = z.enum(CONDITION_MODES);
export type ConditionMode = z.infer<typeof ConditionModeSchema>;

/** Short labels for the mode, English + Traditional Chinese (same pattern as the tag taxonomy). */
export const CONDITION_MODE_INFO: Record<
  ConditionMode,
  { en: string; zh: string; headlineEn: string; headlineZh: string }
> = {
  normal: {
    en: 'Normal',
    zh: '一般',
    headlineEn: 'Pleasant for walking — fastest routes first',
    headlineZh: '適合步行 — 優先顯示最快路線',
  },
  rain: {
    en: 'Rain',
    zh: '下雨',
    headlineEn: 'Rain — showing sheltered routes first',
    headlineZh: '下雨 — 優先顯示有蓋路線',
  },
  heat: {
    en: 'Heat',
    zh: '炎熱',
    headlineEn: 'Very hot — showing shaded routes first',
    headlineZh: '天氣炎熱 — 優先顯示有遮蔭路線',
  },
  night: {
    en: 'Night',
    zh: '夜間',
    headlineEn: 'After dark — fastest routes first',
    headlineZh: '天黑後 — 優先顯示最快路線',
  },
  typhoon_or_black_rain: {
    en: 'Severe weather',
    zh: '惡劣天氣',
    headlineEn: 'Severe weather — avoid walking far, indoor routes first',
    headlineZh: '惡劣天氣 — 避免長途步行，優先室內路線',
  },
};

// ---- what we send to the app ---------------------------------------------------------------

export const WeatherWarningSchema = z.object({
  /** HKO code, e.g. "WHOT" (Very Hot), "WRAINA" (Amber rainstorm), "TC8NE" (Signal No. 8). */
  code: z.string(),
  name: z.string(),
});
export type WeatherWarning = z.infer<typeof WeatherWarningSchema>;

export const ConditionsSchema = z.object({
  temp_c: z.number().nullable(),
  humidity: z.number().nullable(),
  uv_index: z.number().nullable(),
  /** Highest rainfall in the past hour in the districts around CityU (Kowloon City, Sham Shui Po). */
  rain_mm_last_hour: z.number().nullable(),
  warnings: z.array(WeatherWarningSchema),
  is_raining: z.boolean(),
  is_hot: z.boolean(),
  sun: z.object({ altitude_deg: z.number(), azimuth_deg: z.number() }),
  is_daylight: z.boolean(),
  mode: ConditionModeSchema,
  /** When HKO published the weather we used (null when we have none). */
  observed_at: z.string().nullable(),
  /** When we fetched it from HKO. */
  fetched_at: z.string(),
  /** True when HKO couldn't be reached and the data is older than usual (or missing). */
  stale: z.boolean(),
  /** 'hko' = fresh, 'cache' = last good HKO answer, 'defaults' = no weather, time of day only. */
  source: z.enum(['hko', 'cache', 'defaults']),
});
export type Conditions = z.infer<typeof ConditionsSchema>;

// ---- HKO raw responses (lenient: HKO leaves fields "" when not reported, e.g. UV at night) -----

export type HkoFeed = 'rhrread' | 'warnsum';

/** HKO open data API (data.gov.hk). No key needed. */
export const HKO_FEED_URLS: Record<HkoFeed, string> = {
  rhrread: 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=en',
  warnsum: 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=en',
};

/** How long a fetched answer counts as fresh. HKO updates current weather hourly. */
export const HKO_FRESH_MS: Record<HkoFeed, number> = {
  rhrread: 10 * 60_000,
  warnsum: 5 * 60_000,
};

/** Older than this, cached weather is too old to describe "now", so we fall back to defaults. */
export const HKO_MAX_STALE_MS = 6 * 60 * 60_000;

const Reading = z.object({ place: z.string(), value: z.number() });

export const HkoCurrentSchema = z.object({
  temperature: z.object({ data: z.array(Reading) }).optional(),
  humidity: z.object({ data: z.array(Reading) }).optional(),
  // "max" is missing when a district's gauge is under maintenance.
  rainfall: z
    .object({ data: z.array(z.object({ place: z.string(), max: z.number().optional() })) })
    .optional(),
  // "" at night, an object in the daytime.
  uvindex: z.union([z.literal(''), z.object({ data: z.array(Reading) })]).optional(),
  updateTime: z.string().optional(),
});

// warnsum: {} when there are no warnings, otherwise { WHOT: { name, code, actionCode, ... }, ... }
export const HkoWarningsSchema = z.record(
  z.string(),
  z.object({ name: z.string(), code: z.string(), actionCode: z.string().optional() }),
);

/** Weather stations / districts closest to CityU and Kowloon Tong, best first. */
const TEMP_STATIONS = ['Kowloon City', 'Sham Shui Po', 'Hong Kong Observatory'];
const RAIN_DISTRICTS = ['Kowloon City', 'Sham Shui Po'];

export type CurrentWeather = {
  temp_c: number | null;
  humidity: number | null;
  uv_index: number | null;
  rain_mm_last_hour: number | null;
  observed_at: string | null;
};

export function parseHkoCurrent(raw: unknown): CurrentWeather | null {
  const parsed = HkoCurrentSchema.safeParse(raw);
  if (!parsed.success) return null;
  const d = parsed.data;

  const temps = d.temperature?.data ?? [];
  const temp = TEMP_STATIONS.map((s) => temps.find((r) => r.place === s)).find(Boolean);

  const rains = (d.rainfall?.data ?? []).filter(
    (r) => RAIN_DISTRICTS.includes(r.place) && r.max !== undefined,
  );
  const uv = typeof d.uvindex === 'object' ? d.uvindex.data[0] : undefined;

  return {
    temp_c: temp?.value ?? null,
    humidity: d.humidity?.data[0]?.value ?? null,
    uv_index: uv?.value ?? null,
    rain_mm_last_hour: rains.length > 0 ? Math.max(...rains.map((r) => r.max!)) : null,
    observed_at: d.updateTime ?? null,
  };
}

export function parseHkoWarnings(raw: unknown): WeatherWarning[] | null {
  const parsed = HkoWarningsSchema.safeParse(raw);
  if (!parsed.success) return null;
  return Object.values(parsed.data)
    .filter((w) => w.actionCode !== 'CANCEL') // a cancelled warning is no longer in force
    .map((w) => ({ code: w.code, name: w.name }));
}

// ---- deciding the mode ---------------------------------------------------------------------

/** Typhoon Signal No. 8 or higher, or a Black Rainstorm: people should not be walking far. */
const SEVERE_CODES = new Set(['WRAINB', 'TC8NE', 'TC8SE', 'TC8NW', 'TC8SW', 'TC9', 'TC10']);
/** Amber/Red/Black rainstorm, or a thunderstorm warning (heavy showers likely). */
const RAIN_CODES = new Set(['WRAINA', 'WRAINR', 'WRAINB', 'WTS']);

/** HKO's "Very hot" threshold for us: 31 °C, or UV "high" (6+), or the Very Hot Weather Warning. */
export const HOT_TEMP_C = 31;
export const HIGH_UV = 6;

export function isHot(w: Pick<CurrentWeather, 'temp_c' | 'uv_index'>, warnings: WeatherWarning[]) {
  return (
    (w.temp_c ?? 0) >= HOT_TEMP_C ||
    (w.uv_index ?? 0) >= HIGH_UV ||
    warnings.some((x) => x.code === 'WHOT')
  );
}

/**
 * Which condition matters most. Order = priority:
 * severe weather > rain > heat (daytime only — no sun to hide from at night) > night > normal.
 */
export function deriveConditionMode(input: {
  warnings: WeatherWarning[];
  is_raining: boolean;
  is_hot: boolean;
  is_daylight: boolean;
}): ConditionMode {
  const codes = input.warnings.map((w) => w.code);
  if (codes.some((c) => SEVERE_CODES.has(c))) return 'typhoon_or_black_rain';
  if (input.is_raining || codes.some((c) => RAIN_CODES.has(c))) return 'rain';
  if (input.is_hot && input.is_daylight) return 'heat';
  if (!input.is_daylight) return 'night';
  return 'normal';
}

/** Builds the full answer from whatever weather we have (null = none, time of day only). */
export function buildConditions(args: {
  now: Date;
  weather: CurrentWeather | null;
  warnings: WeatherWarning[];
  fetchedAt: Date;
  source: Conditions['source'];
}): Conditions {
  const { now, weather, warnings } = args;
  const sun = sunPosition(now, CONDITIONS_POINT.lat, CONDITIONS_POINT.lng);
  const is_daylight = sun.altitude_deg > 0;
  const is_raining = (weather?.rain_mm_last_hour ?? 0) > 0;
  const is_hot = weather ? isHot(weather, warnings) : false;
  return {
    temp_c: weather?.temp_c ?? null,
    humidity: weather?.humidity ?? null,
    uv_index: weather?.uv_index ?? null,
    rain_mm_last_hour: weather?.rain_mm_last_hour ?? null,
    warnings,
    is_raining,
    is_hot,
    sun,
    is_daylight,
    mode: deriveConditionMode({ warnings, is_raining, is_hot, is_daylight }),
    observed_at: weather?.observed_at ?? null,
    fetched_at: args.fetchedAt.toISOString(),
    stale: args.source !== 'hko',
    source: args.source,
  };
}

/** No weather at all (offline): day/night from the sun only. The phone can compute this itself. */
export function defaultConditions(now: Date): Conditions {
  return buildConditions({ now, weather: null, warnings: [], fetchedAt: now, source: 'defaults' });
}

// ---- fetching with cache + fallbacks -------------------------------------------------------

export type CachedFeed = { payload: unknown; fetchedAt: Date };

export type ConditionsDeps = {
  now: Date;
  /** Downloads one HKO feed and returns its JSON. Throws on failure. */
  fetchFeed: (feed: HkoFeed) => Promise<unknown>;
  readCache: (feed: HkoFeed) => Promise<CachedFeed | null>;
  writeCache: (feed: HkoFeed, payload: unknown, fetchedAt: Date) => Promise<void>;
};

/** A feed's payload plus whether it is fresh; null = nothing usable. */
type FeedResult = { payload: unknown; fetchedAt: Date; fresh: boolean } | null;

const isValid = (feed: HkoFeed, payload: unknown) =>
  feed === 'rhrread' ? parseHkoCurrent(payload) !== null : parseHkoWarnings(payload) !== null;

async function loadFeed(feed: HkoFeed, deps: ConditionsDeps): Promise<FeedResult> {
  const now = deps.now.getTime();
  // A broken cache must never break the answer, so every step is guarded.
  const cached = await deps.readCache(feed).catch(() => null);
  const cachedOk = cached && isValid(feed, cached.payload) ? cached : null;
  if (cachedOk && now - cachedOk.fetchedAt.getTime() < HKO_FRESH_MS[feed]) {
    return { ...cachedOk, fresh: true };
  }

  try {
    const payload = await deps.fetchFeed(feed);
    if (!isValid(feed, payload)) throw new Error(`HKO ${feed} sent an unexpected answer`);
    await deps.writeCache(feed, payload, deps.now).catch(() => undefined);
    return { payload, fetchedAt: deps.now, fresh: true };
  } catch {
    if (cachedOk && now - cachedOk.fetchedAt.getTime() < HKO_MAX_STALE_MS) {
      return { ...cachedOk, fresh: false };
    }
    return null;
  }
}

/** Current conditions: fresh HKO → cached HKO → time-of-day defaults. Never throws. */
export async function getConditions(deps: ConditionsDeps): Promise<Conditions> {
  const [current, warnings] = await Promise.all([
    loadFeed('rhrread', deps),
    loadFeed('warnsum', deps),
  ]);
  const weather = current ? parseHkoCurrent(current.payload) : null;
  if (!current || !weather) return defaultConditions(deps.now);

  const fresh = current.fresh && (warnings?.fresh ?? false);
  return buildConditions({
    now: deps.now,
    weather,
    warnings: warnings ? (parseHkoWarnings(warnings.payload) ?? []) : [],
    fetchedAt: current.fetchedAt,
    source: fresh ? 'hko' : 'cache',
  });
}

// ---- for the UI ----------------------------------------------------------------------------

/** "31 °C · UV 8 · 2 mm rain" — only the facts we actually have. */
export function conditionFacts(c: Conditions): string {
  const parts: string[] = [];
  if (c.temp_c !== null) parts.push(`${Math.round(c.temp_c)} °C`);
  if (c.uv_index !== null) parts.push(`UV ${Math.round(c.uv_index)}`);
  if (c.rain_mm_last_hour !== null && c.rain_mm_last_hour > 0) {
    parts.push(`${c.rain_mm_last_hour} mm rain`);
  }
  return parts.join(' · ');
}

/**
 * Demo mode ("simulate rain / heat"): pretend the weather is `mode`, so the pitch can show routes
 * changing even on a dry, mild day. The app labels the result "Simulated" — it is never shown as real.
 */
export function simulateConditions(real: Conditions, mode: ConditionMode): Conditions {
  const base = { ...real, mode, stale: false };
  switch (mode) {
    case 'rain':
      return { ...base, rain_mm_last_hour: 8, is_raining: true, uv_index: null };
    case 'heat':
      return {
        ...base,
        temp_c: 33,
        uv_index: 9,
        is_hot: true,
        is_raining: false,
        rain_mm_last_hour: 0,
        warnings: [{ code: 'WHOT', name: 'Very Hot Weather Warning' }],
      };
    case 'typhoon_or_black_rain':
      return {
        ...base,
        is_raining: true,
        rain_mm_last_hour: 70,
        warnings: [{ code: 'WRAINB', name: 'Black Rainstorm Warning Signal' }],
      };
    case 'night':
      return { ...base, is_daylight: false, uv_index: null, is_hot: false };
    case 'normal':
      return {
        ...base,
        temp_c: 25,
        uv_index: 3,
        is_hot: false,
        is_raining: false,
        rain_mm_last_hour: 0,
        warnings: [],
      };
  }
}
