import { describe, expect, it } from 'vitest';

import {
  CONDITIONS_POINT,
  conditionFacts,
  deriveConditionMode,
  getConditions,
  HKO_FRESH_MS,
  parseHkoCurrent,
  parseHkoWarnings,
  simulateConditions,
  type CachedFeed,
  type ConditionsDeps,
  type HkoFeed,
} from './conditions.ts';
import { DEMO_CENTER } from './presets.ts';

// Trimmed real HKO answers (shape as of Oct 2026).
const current = (overrides: Record<string, unknown> = {}) => ({
  rainfall: {
    data: [
      { unit: 'mm', place: 'Kowloon City', max: 0, main: 'FALSE' },
      { unit: 'mm', place: 'Sham Shui Po', max: 0, main: 'FALSE' },
      { unit: 'mm', place: 'Sha Tin', max: 12, main: 'FALSE' },
    ],
  },
  uvindex: { data: [{ place: "King's Park", value: 8, desc: 'very high' }] },
  updateTime: '2026-10-16T13:02:00+08:00',
  temperature: {
    data: [
      { place: 'Hong Kong Observatory', value: 30, unit: 'C' },
      { place: 'Kowloon City', value: 32, unit: 'C' },
    ],
  },
  humidity: { data: [{ unit: 'percent', value: 65, place: 'Hong Kong Observatory' }] },
  ...overrides,
});

const NOON = new Date('2026-10-16T05:00:00Z'); // 13:00 HK, sun up
const MIDNIGHT = new Date('2026-10-16T16:00:00Z'); // 00:00 HK

describe('parseHkoCurrent', () => {
  it('picks the station and districts nearest CityU', () => {
    expect(parseHkoCurrent(current())).toEqual({
      temp_c: 32, // Kowloon City, not the Observatory
      humidity: 65,
      uv_index: 8,
      rain_mm_last_hour: 0, // Sha Tin's 12 mm is too far away to count
      observed_at: '2026-10-16T13:02:00+08:00',
    });
  });

  it('copes with HKO leaving fields empty (UV at night, gauges under maintenance)', () => {
    const w = parseHkoCurrent(
      current({
        uvindex: '',
        rainfall: { data: [{ unit: 'mm', place: 'Kowloon City', main: 'TRUE' }] },
      }),
    );
    expect(w?.uv_index).toBeNull();
    expect(w?.rain_mm_last_hour).toBeNull();
  });

  it('falls back to the Observatory temperature when Kowloon stations are missing', () => {
    const w = parseHkoCurrent(
      current({ temperature: { data: [{ place: 'Hong Kong Observatory', value: 27 }] } }),
    );
    expect(w?.temp_c).toBe(27);
  });

  it('rejects something that is not an HKO answer', () => {
    expect(parseHkoCurrent('<html>error</html>')).toBeNull();
  });
});

describe('parseHkoWarnings', () => {
  it('reads warnings in force and skips cancelled ones', () => {
    expect(
      parseHkoWarnings({
        WHOT: { name: 'Very Hot Weather Warning', code: 'WHOT', actionCode: 'ISSUE' },
        WRAIN: { name: 'Amber Rainstorm Warning Signal', code: 'WRAINA', actionCode: 'CANCEL' },
      }),
    ).toEqual([{ code: 'WHOT', name: 'Very Hot Weather Warning' }]);
  });

  it('treats {} as "no warnings"', () => {
    expect(parseHkoWarnings({})).toEqual([]);
  });
});

describe('deriveConditionMode', () => {
  const base = { warnings: [], is_raining: false, is_hot: false, is_daylight: true };
  const warn = (code: string) => [{ code, name: code }];

  it('is normal on a mild dry day', () => {
    expect(deriveConditionMode(base)).toBe('normal');
  });
  it('rain when it is raining or a rainstorm / thunderstorm warning is up', () => {
    expect(deriveConditionMode({ ...base, is_raining: true })).toBe('rain');
    expect(deriveConditionMode({ ...base, warnings: warn('WRAINA') })).toBe('rain');
    expect(deriveConditionMode({ ...base, warnings: warn('WTS') })).toBe('rain');
  });
  it('heat in the daytime only', () => {
    expect(deriveConditionMode({ ...base, is_hot: true })).toBe('heat');
    expect(deriveConditionMode({ ...base, is_hot: true, is_daylight: false })).toBe('night');
  });
  it('rain beats heat; severe weather beats everything', () => {
    expect(deriveConditionMode({ ...base, is_hot: true, is_raining: true })).toBe('rain');
    expect(deriveConditionMode({ ...base, is_raining: true, warnings: warn('TC8NE') })).toBe(
      'typhoon_or_black_rain',
    );
    expect(deriveConditionMode({ ...base, warnings: warn('WRAINB') })).toBe(
      'typhoon_or_black_rain',
    );
  });
  it('Signal No. 3 alone is not "severe"', () => {
    expect(deriveConditionMode({ ...base, warnings: warn('TC3') })).toBe('normal');
  });
});

/** Fake HKO + cache, so we can test every fallback without the network. */
function fakeDeps(opts: {
  now: Date;
  hko?: Partial<Record<HkoFeed, unknown>> | 'down';
  cache?: Partial<Record<HkoFeed, CachedFeed>>;
}) {
  const cache = { ...opts.cache };
  const fetched: HkoFeed[] = [];
  const deps: ConditionsDeps = {
    now: opts.now,
    fetchFeed: async (feed) => {
      fetched.push(feed);
      if (opts.hko === 'down' || !opts.hko?.[feed]) throw new Error('HKO down');
      return opts.hko[feed];
    },
    readCache: async (feed) => cache[feed] ?? null,
    writeCache: async (feed, payload, fetchedAt) => {
      cache[feed] = { payload, fetchedAt };
    },
  };
  return { deps, cache, fetched };
}

const minutesBefore = (d: Date, m: number) => new Date(d.getTime() - m * 60_000);

describe('getConditions', () => {
  it('uses fresh HKO data and caches it', async () => {
    const { deps, cache } = fakeDeps({ now: NOON, hko: { rhrread: current(), warnsum: {} } });
    const c = await getConditions(deps);
    expect(c.source).toBe('hko');
    expect(c.stale).toBe(false);
    expect(c.temp_c).toBe(32);
    expect(c.is_hot).toBe(true);
    expect(c.mode).toBe('heat');
    expect(cache.rhrread?.fetchedAt).toEqual(NOON);
  });

  it('does not call HKO again while the cache is fresh', async () => {
    const recent = { payload: current(), fetchedAt: minutesBefore(NOON, 2) };
    const { deps, fetched } = fakeDeps({
      now: NOON,
      hko: 'down',
      cache: { rhrread: recent, warnsum: { payload: {}, fetchedAt: minutesBefore(NOON, 2) } },
    });
    const c = await getConditions(deps);
    expect(fetched).toEqual([]);
    expect(c.source).toBe('hko');
  });

  it('falls back to the last cached answer when HKO is down, marked stale', async () => {
    const old = { payload: current(), fetchedAt: minutesBefore(NOON, 90) };
    const { deps } = fakeDeps({ now: NOON, hko: 'down', cache: { rhrread: old } });
    const c = await getConditions(deps);
    expect(c.source).toBe('cache');
    expect(c.stale).toBe(true);
    expect(c.temp_c).toBe(32);
    expect(c.fetched_at).toBe(old.fetchedAt.toISOString());
  });

  it('falls back to time-of-day defaults when HKO is down and the cache is too old', async () => {
    const ancient = { payload: current(), fetchedAt: minutesBefore(NOON, 7 * 60) };
    const { deps } = fakeDeps({ now: MIDNIGHT, hko: 'down', cache: { rhrread: ancient } });
    const c = await getConditions(deps);
    expect(c.source).toBe('defaults');
    expect(c.temp_c).toBeNull();
    expect(c.mode).toBe('night');
  });

  it('ignores a garbage HKO answer instead of caching it', async () => {
    const { deps, cache } = fakeDeps({
      now: NOON,
      hko: { rhrread: '<html>maintenance</html>', warnsum: {} },
    });
    const c = await getConditions(deps);
    expect(c.source).toBe('defaults');
    expect(cache.rhrread).toBeUndefined();
  });

  it('still answers when the cache itself is broken', async () => {
    const { deps } = fakeDeps({ now: NOON, hko: { rhrread: current(), warnsum: {} } });
    deps.readCache = async () => {
      throw new Error('db down');
    };
    deps.writeCache = async () => {
      throw new Error('db down');
    };
    expect((await getConditions(deps)).source).toBe('hko');
  });

  it('refetches once the cache is older than the fresh window', async () => {
    const old = {
      payload: current(),
      fetchedAt: minutesBefore(NOON, HKO_FRESH_MS.rhrread / 60_000 + 1),
    };
    const { deps, fetched } = fakeDeps({
      now: NOON,
      hko: { rhrread: current(), warnsum: {} },
      cache: { rhrread: old },
    });
    await getConditions(deps);
    expect(fetched).toContain('rhrread');
  });
});

it('reads the sun at the demo-area centre', () => {
  expect(CONDITIONS_POINT).toEqual(DEMO_CENTER);
});

describe('UI helpers', () => {
  it('conditionFacts lists only what we know', async () => {
    const { deps } = fakeDeps({ now: NOON, hko: { rhrread: current(), warnsum: {} } });
    expect(conditionFacts(await getConditions(deps))).toBe('32 °C · UV 8');
  });

  it('simulateConditions switches the mode and the facts', async () => {
    const { deps } = fakeDeps({ now: NOON, hko: { rhrread: current(), warnsum: {} } });
    const rain = simulateConditions(await getConditions(deps), 'rain');
    expect(rain.mode).toBe('rain');
    expect(rain.is_raining).toBe(true);
    expect(conditionFacts(rain)).toContain('mm rain');
  });
});
