// Error reports to Sentry (error-report.ts, DECISIONS D47).
import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';

import { buildEnvelope, parseDsn } from './error-report.ts';

Deno.test('reads a Sentry DSN; anything else turns reporting off', () => {
  assertEquals(parseDsn('https://abc123@o42.ingest.sentry.io/7'), {
    endpoint: 'https://o42.ingest.sentry.io/api/7/envelope/',
    publicKey: 'abc123',
  });
  assertEquals(parseDsn(undefined), null);
  assertEquals(parseDsn(''), null);
  assertEquals(parseDsn('not a url'), null);
  assertEquals(parseDsn('https://o42.ingest.sentry.io/7'), null); // no key
});

Deno.test('a report names the function and contains no coordinates', () => {
  const lines = buildEnvelope(
    'smart-route',
    new Error('No path from 22.3375,114.1729 to 22.33612,114.17208'),
    new Date('2026-11-20T00:00:00Z'),
  ).split('\n');
  assertEquals(lines.length, 3);
  assertEquals(JSON.parse(lines[1]), { type: 'event' });
  const event = JSON.parse(lines[2]);
  assertEquals(event.tags, { function: 'smart-route' });
  assertEquals(event.exception.values[0].value, 'No path from [coord],[coord] to [coord],[coord]');
  assertEquals(event.user, undefined);
  for (const line of lines) assertEquals(/22\.33|114\.17/.test(line), false);
  assertStringIncludes(lines[0], '"sent_at":"2026-11-20T00:00:00.000Z"');
});
