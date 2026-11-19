// Which web pages may call our functions (cors.ts, DECISIONS D44).
import { assertEquals } from 'jsr:@std/assert@1';

import { originAllowed } from './cors.ts';

const LIST = 'https://scenicstroll.expo.app, https://*.scenicstroll.expo.app';

Deno.test('our site and its preview subdomains are allowed', () => {
  assertEquals(originAllowed('https://scenicstroll.expo.app', LIST), true);
  assertEquals(originAllowed('https://pr-12.scenicstroll.expo.app', LIST), true);
});

Deno.test('other sites are refused, including look-alikes', () => {
  assertEquals(originAllowed('https://evil.example', LIST), false);
  assertEquals(originAllowed('https://scenicstroll.expo.app.evil.example', LIST), false);
  assertEquals(originAllowed('http://scenicstroll.expo.app', LIST), false); // not HTTPS
  assertEquals(originAllowed('https://a.b.scenicstroll.expo.app', LIST), false); // one level only
});

Deno.test('local development is always allowed', () => {
  assertEquals(originAllowed('http://localhost:8081', LIST), true);
  assertEquals(originAllowed('http://127.0.0.1:5055', LIST), true);
});

Deno.test('before ALLOWED_ORIGINS is set, any origin works (as before the launch)', () => {
  assertEquals(originAllowed('https://anything.example', undefined), true);
  assertEquals(originAllowed('https://anything.example', ''), true);
});
