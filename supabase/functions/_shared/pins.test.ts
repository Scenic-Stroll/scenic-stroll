// Pin helpers for the Edge Functions (D53). fetch is faked: no network, no keys.
import { assert, assertEquals, assertRejects, assertStringIncludes } from 'jsr:@std/assert@1';

import { generateJson, LlmError } from './llm/gemini.ts';
import { nearestOsmFeature } from './osm-places.ts';
import { buildPrompt, parseGenerated } from './pin-versions.ts';
import { extractDoi, fromCrossref, fromOpenAlex, lookupSource } from './sources.ts';

function fakeFetch(answers: Record<string, unknown>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = ((url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const key = Object.keys(answers).find((k) => String(url).includes(k));
    const body = key ? answers[key] : null;
    return Promise.resolve(new Response(JSON.stringify(body), { status: body ? 200 : 404 }));
  }) as typeof fetch;
  return { fn, calls };
}

// ---- sources ---------------------------------------------------------------------------------

Deno.test('extractDoi reads bare DOIs, doi: prefixes and doi.org links', () => {
  assertEquals(extractDoi('10.1016/j.cities.2019.01.002'), '10.1016/j.cities.2019.01.002');
  assertEquals(
    extractDoi('https://doi.org/10.1016/j.cities.2019.01.002.'),
    '10.1016/j.cities.2019.01.002',
  );
  assertEquals(extractDoi('Kowloon Tong garden city'), null);
});

Deno.test('OpenAlex work → source, with open-access link and status', () => {
  const s = fromOpenAlex({
    display_name: 'Garden cities in Asia',
    doi: 'https://doi.org/10.1234/abc',
    open_access: { is_oa: true, oa_url: 'https://example.org/paper.pdf' },
  });
  assertEquals(s, {
    title: 'Garden cities in Asia',
    url: 'https://example.org/paper.pdf',
    doi: '10.1234/abc',
    source_db: 'openalex',
    is_open_access: true,
  });
  assertEquals(fromOpenAlex({ display_name: '' }), null);
});

Deno.test('lookupSource: OpenAlex first, Crossref when OpenAlex has nothing', async () => {
  const onlyCrossref = fakeFetch({
    'api.crossref.org/works/10.5555': {
      message: {
        title: ['A Crossref title'],
        DOI: '10.5555/xyz',
        URL: 'https://doi.org/10.5555/xyz',
      },
    },
  });
  const s = await lookupSource('10.5555/xyz', onlyCrossref.fn);
  assertEquals(s?.source_db, 'crossref');
  assertEquals(s?.is_open_access, false);
  assertStringIncludes(onlyCrossref.calls[0]!.url, 'api.openalex.org/works/doi:10.5555');
  assertEquals(fromCrossref({ title: [] }), null);
});

// ---- OSM snap --------------------------------------------------------------------------------

Deno.test('nearestOsmFeature keeps OSM places within the radius, nearest first', () => {
  const place = nearestOsmFeature(
    {
      features: [
        {
          geometry: { coordinates: [114.17, 22.33] },
          properties: { source: 'openstreetmap', id: 'node/2', name: 'Far', distance: 0.03 },
        },
        {
          geometry: { coordinates: [114.17, 22.33] },
          properties: {
            source: 'openstreetmap',
            gid: 'openstreetmap:venue:node/1',
            name: 'Near',
            distance: 0.012,
          },
        },
        {
          geometry: { coordinates: [114.17, 22.33] },
          properties: { source: 'whosonfirst', id: '85', name: 'Not OSM', distance: 0.001 },
        },
      ],
    },
    25,
  );
  assertEquals(place?.osm_id, 'node/1');
  assertEquals(place?.distance_m, 12);
});

// ---- Gemini ----------------------------------------------------------------------------------

Deno.test('Gemini: key in a header (never the URL), JSON answer parsed', async () => {
  const fake = fakeFetch({
    generateContent: { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] },
  });
  const out = await generateJson({ apiKey: 'secret-k', model: 'm', prompt: 'p', fetchFn: fake.fn });
  assertEquals(out, { ok: true });
  assert(!fake.calls[0]!.url.includes('secret-k'));
  assertEquals(new Headers(fake.calls[0]!.init?.headers).get('x-goog-api-key'), 'secret-k');
});

Deno.test('Gemini: an error status becomes an LlmError', async () => {
  const fake = fakeFetch({});
  await assertRejects(
    () => generateJson({ apiKey: 'k', model: 'm', prompt: 'p', fetchFn: fake.fn }),
    LlmError,
  );
});

// ---- prompt and answer check -----------------------------------------------------------------

const PIN = {
  title: 'Why Kent Road is in Kowloon',
  summary: 'SUMMARY TEXT FROM THE EXPERT.',
  beyond_hk_text: null,
  sources: [{ title: 'A source', url: 'https://example.org', doi: null }],
};

Deno.test('the prompt forbids new facts and keeps the child version short', () => {
  const prompt = buildPrompt(PIN);
  assertStringIncludes(prompt, 'Use ONLY facts stated in the SUMMARY');
  assertStringIncludes(prompt, 'Do not add any new');
  assertStringIncludes(prompt, 'at most 80 words');
  assertStringIncludes(prompt, 'SUMMARY TEXT FROM THE EXPERT.');
});

const question = {
  prompt: 'What is this place?',
  options: ['A road', 'A river'],
  answer: 'A road',
  explanation: 'The text says it is a road.',
};
const version = (reading_level: string, body = 'A short and simple text about the place.') => ({
  reading_level,
  body,
  questions: [question],
});

Deno.test('a valid answer passes; missing levels, long child text and wrong answers fail', () => {
  assert(parseGenerated({ versions: [version('child'), version('teen'), version('adult')] }).ok);
  assert(!parseGenerated({ versions: [version('adult'), version('teen'), version('adult')] }).ok);
  const long = Array.from({ length: 120 }, () => 'word').join(' ');
  assert(
    !parseGenerated({ versions: [version('child', long), version('teen'), version('adult')] }).ok,
  );
  const wrong = { ...version('adult'), questions: [{ ...question, answer: 'A bridge' }] };
  assert(!parseGenerated({ versions: [version('child'), version('teen'), wrong] }).ok);
  assert(!parseGenerated('not json').ok);
});
