// Deno tests for the routing providers. Run: npm run test:functions
// fetch is replaced with a fake, so these run offline and without API keys.
import { assertEquals, assertRejects, assertThrows } from 'jsr:@std/assert@1';

import { createGoogleProvider } from './google.ts';
import { getRoutingProvider, ProviderError, routingHealth } from './index.ts';
import { createOrsProvider } from './ors.ts';

const origin = { lat: 22.336961, lng: 114.175531 }; // Kowloon Tong Exit C1
const destination = { lat: 22.335892, lng: 114.173197 }; // YEUNG

/** Replaces global fetch for one test and records the request. */
function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

Deno.test('ORS: parses a GeoJSON route and sends [lng, lat] order', async () => {
  const fake = fakeFetch(200, {
    type: 'FeatureCollection',
    features: [
      {
        geometry: {
          type: 'LineString',
          coordinates: [
            [114.175531, 22.336961],
            [114.1745, 22.3365],
            [114.173197, 22.335892],
          ],
        },
        properties: {
          summary: { distance: 287.4, duration: 206.9 },
          segments: [
            {
              steps: [
                { instruction: 'Head west on Tat Chee Avenue', distance: 150.2, duration: 108.1 },
                { instruction: 'Arrive at your destination', distance: 0, duration: 0 },
              ],
            },
          ],
        },
      },
    ],
  });
  try {
    const route = await createOrsProvider('test-key').walk(origin, destination);
    assertEquals(route.provider, 'ors');
    assertEquals(route.distance_m, 287.4);
    assertEquals(route.duration_s, 206.9);
    assertEquals(route.coordinates[0], { lat: 22.336961, lng: 114.175531 });
    assertEquals(route.coordinates.length, 3);
    assertEquals(route.steps?.length, 2);
    assertEquals(route.steps?.[0], {
      instruction: 'Head west on Tat Chee Avenue',
      distance_m: 150.2,
      duration_s: 108.1,
    });

    const sent = JSON.parse(String(fake.calls[0]!.init!.body));
    assertEquals(sent.coordinates[0], [origin.lng, origin.lat]);
    assertEquals(
      (fake.calls[0]!.init!.headers as Record<string, string>).Authorization,
      'test-key',
    );
  } finally {
    fake.restore();
  }
});

Deno.test('ORS: HTTP error becomes a ProviderError', async () => {
  const fake = fakeFetch(403, { error: 'Access to this API has been disallowed' });
  try {
    await assertRejects(() => createOrsProvider('bad').walk(origin, destination), ProviderError);
  } finally {
    fake.restore();
  }
});

Deno.test('ORS: geocode keeps only well-formed results', async () => {
  const fake = fakeFetch(200, {
    features: [
      { geometry: { coordinates: [114.1746, 22.3373] }, properties: { label: 'Festival Walk' } },
      { geometry: { coordinates: [] }, properties: { label: 'broken' } },
    ],
  });
  try {
    const results = await createOrsProvider('k').geocode('festival walk');
    assertEquals(results, [{ label: 'Festival Walk', point: { lat: 22.3373, lng: 114.1746 } }]);
    const url = new URL(fake.calls[0]!.url);
    assertEquals(url.searchParams.get('boundary.country'), 'HK');
  } finally {
    fake.restore();
  }
});

Deno.test('Google: decodes the polyline and parses "123s" durations', async () => {
  const fake = fakeFetch(200, {
    routes: [
      {
        distanceMeters: 310,
        duration: '245s',
        polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' }, // Google's sample polyline
        legs: [
          {
            steps: [
              {
                navigationInstruction: { instructions: 'Head north' },
                distanceMeters: 120,
                staticDuration: '90s',
              },
              { distanceMeters: 5 }, // no instruction → skipped
            ],
          },
        ],
      },
    ],
  });
  try {
    const route = await createGoogleProvider('k').walk(origin, destination);
    assertEquals(route.provider, 'google');
    assertEquals(route.distance_m, 310);
    assertEquals(route.duration_s, 245);
    assertEquals(route.steps, [{ instruction: 'Head north', distance_m: 120, duration_s: 90 }]);
    assertEquals(route.coordinates.length, 3);
    const sent = JSON.parse(String(fake.calls[0]!.init!.body));
    assertEquals(sent.travelMode, 'WALK');
  } finally {
    fake.restore();
  }
});

Deno.test('getRoutingProvider: defaults to ORS and needs its key', () => {
  const env = (vars: Record<string, string>) => (name: string) => vars[name];
  assertEquals(getRoutingProvider(env({ ORS_API_KEY: 'k' })).name, 'ors');
  assertEquals(
    getRoutingProvider(env({ ROUTING_PROVIDER: 'google', GOOGLE_ROUTES_API_KEY: 'k' })).name,
    'google',
  );
  assertThrows(() => getRoutingProvider(env({})), ProviderError, 'ORS_API_KEY');
  assertThrows(() => getRoutingProvider(env({ ROUTING_PROVIDER: 'bing' })), ProviderError);
});

Deno.test('routingHealth: names missing secrets, never values', () => {
  const env = (vars: Record<string, string>) => (name: string) => vars[name];
  assertEquals(routingHealth(env({})), { provider: 'ors', missingSecrets: ['ORS_API_KEY'] });
  assertEquals(routingHealth(env({ ORS_API_KEY: 'secret-value' })), {
    provider: 'ors',
    missingSecrets: [],
  });
  assertEquals(routingHealth(env({ ROUTING_PROVIDER: 'google' })), {
    provider: 'google',
    missingSecrets: ['GOOGLE_ROUTES_API_KEY'],
  });
  // The secret value must never appear in the report.
  assertEquals(
    JSON.stringify(routingHealth(env({ ORS_API_KEY: 'secret-value' }))).includes('secret-value'),
    false,
  );
});
