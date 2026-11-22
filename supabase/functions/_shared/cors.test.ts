// Which web pages may call our functions (cors.ts, DECISIONS D44).
import { assertEquals } from 'jsr:@std/assert@1';

import { originAllowed } from './cors.ts';

// The real list (docs/DEPLOY.md): production, and EAS Hosting preview links
// (scenic-stroll--<id>.expo.app).
const LIST = 'https://scenic-stroll.expo.app, https://scenic-stroll--*.expo.app';

Deno.test('our site and its preview subdomains are allowed', () => {
  assertEquals(originAllowed('https://scenic-stroll.expo.app', LIST), true);
  assertEquals(originAllowed('https://scenic-stroll--on9ilkv1yg.expo.app', LIST), true);
});

Deno.test('other sites are refused, including look-alikes', () => {
  assertEquals(originAllowed('https://evil.example', LIST), false);
  assertEquals(originAllowed('https://other-app.expo.app', LIST), false); // someone else's Expo site
  assertEquals(originAllowed('https://scenic-stroll.expo.app.evil.example', LIST), false);
  assertEquals(originAllowed('http://scenic-stroll.expo.app', LIST), false); // not HTTPS
  assertEquals(originAllowed('https://scenic-stroll--x.evil.expo.app', LIST), false); // no dots
});

Deno.test('local development is always allowed', () => {
  assertEquals(originAllowed('http://localhost:8081', LIST), true);
  assertEquals(originAllowed('http://127.0.0.1:5055', LIST), true);
});

Deno.test('before ALLOWED_ORIGINS is set, any origin works (as before the launch)', () => {
  assertEquals(originAllowed('https://anything.example', undefined), true);
  assertEquals(originAllowed('https://anything.example', ''), true);
});
