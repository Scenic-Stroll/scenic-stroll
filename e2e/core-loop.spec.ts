// The knowledge-pins core loop (D54, D55): an adult sees a live pin on the map, walks past it while
// recording (fake GPS), gets the "Pin saved" toast, opens My collection, reads the pin, and the
// points balance goes up.
//
// The PIN is fake: the pin's data, the collection write, the reading timer, award-points and the
// points summary are answered inside the page, so the test never creates a live pin that real users
// would see. Sign-in and consent are real (session.setup.ts). The server-side rules themselves are
// covered by supabase/tests/database.test.mjs.
import { expect, test } from '@playwright/test';

const PIN = {
  id: 'e2e00000-0000-4000-8000-000000000001',
  title: 'E2E sample pin',
  lat: 22.3372,
  lng: 114.1745,
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((pin) => {
    // ---- Fake GPS: walks north through the pin, one fix every 100 ms, 3 s apart, 5 m each. ----
    const M = 1 / 111_320;
    let t0 = Date.now();
    const fix = (i: number) => ({
      coords: {
        latitude: pin.lat + (i * 5 - 60) * M,
        longitude: pin.lng,
        accuracy: 5,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: 1.6,
      },
      timestamp: t0 + i * 3000,
    });
    const timers: number[] = [];
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (ok: (p: unknown) => void) => setTimeout(() => ok(fix(0)), 10),
        watchPosition: (cb: (p: unknown) => void) => {
          t0 = Date.now();
          let i = 0;
          timers.push(window.setInterval(() => i <= 30 && cb(fix(i++)), 100));
          return timers.length;
        },
        clearWatch: (id: number) => clearInterval(timers[id - 1]),
      },
    });
    if (navigator.permissions) {
      const query = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = (d: PermissionDescriptor) =>
        d.name === 'geolocation'
          ? Promise.resolve({ state: 'granted', onchange: null } as unknown as PermissionStatus)
          : query(d);
    }

    // ---- Fake pin backend, answered inside the page (never reaches the live database). ----
    let balance = 0;
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/rest/v1/pins_map')) {
        return json([
          {
            id: pin.id,
            title: pin.title,
            label: 'expert_verified',
            radius_m: 40,
            topics: ['history'],
            status: 'live',
            is_sample: true,
            place_kind: 'custom',
            place_description: 'A test place',
            lat: pin.lat,
            lng: pin.lng,
          },
        ]);
      }
      if (url.includes('/rest/v1/pins?')) {
        return json({
          id: pin.id,
          title: pin.title,
          label: 'expert_verified',
          is_sample: true,
          beyond_hk_text: null,
          beyond_hk_source_id: null,
        });
      }
      if (url.includes('/rest/v1/pin_sources')) {
        return json([
          {
            id: 'e2e00000-0000-4000-8000-0000000000a1',
            title: 'A test source',
            url: 'https://example.org/source',
            doi: null,
            source_db: 'web',
            is_open_access: true,
          },
        ]);
      }
      if (url.includes('/rest/v1/pin_versions')) {
        return json([
          {
            reading_level: 'adult',
            body: 'THE PIN TEXT: a short, checked note about this place.',
            pin_questions: [
              {
                prompt: 'Is this a test?',
                options: ['Yes', 'No'],
                answer: 'Yes',
                explanation: 'It is an end-to-end test.',
              },
            ],
          },
        ]);
      }
      if (url.includes('/rest/v1/collection_entries')) return new Response(null, { status: 201 });
      if (url.includes('/rpc/start_pin_read')) return new Response(null, { status: 204 });
      if (url.includes('/functions/v1/award-points')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as { action?: string };
        if (body.action === 'pin_read') {
          balance += 20;
          return json({ awarded: 20 });
        }
        return json({ awarded: 0 });
      }
      if (url.includes('/rpc/my_points_summary')) {
        return json([{ balance, today_points: balance, today_meters: 0, earlier_points: 0 }]);
      }
      return realFetch(input, init);
    };
  }, PIN);
});

test('walk past a pin → saved → read it in My collection → points go up', async ({ page }) => {
  await page.goto('/profile');
  await expect(page.getByText('0 points')).toBeVisible();

  // The live pin is on the map.
  await page.goto('/');
  await expect(page.getByRole('button', { name: `Pin: ${PIN.title}` })).toBeVisible();

  // Walk past it while recording.
  await page.getByRole('button', { name: 'Record a route' }).first().click();
  await page.getByRole('button', { name: 'Start recording' }).click();
  await expect(page.getByText(`Pin saved: ${PIN.title}`)).toBeVisible({ timeout: 20_000 });
  // Never the pin's text while walking.
  await expect(page.getByText('THE PIN TEXT')).toHaveCount(0);

  // Read it later, in My collection.
  await page.goBack(); // the recorder is its own page; back to the map and its tab bar
  await page.getByRole('tab', { name: /My collection/ }).click();
  await page.getByRole('button', { name: new RegExp(`^${PIN.title}, unread`) }).click();
  await expect(page.getByText('THE PIN TEXT')).toBeVisible();
  await expect(page.getByText('Expert-verified')).toBeVisible();
  await expect(page.getByRole('link', { name: /A test source/ })).toBeVisible();
  await page.getByRole('button', { name: 'Yes' }).click(); // guess, then see the answer
  await expect(page.getByText('It is an end-to-end test.')).toBeVisible();
  await page.getByRole('button', { name: /Done reading/ }).click();
  await expect(page.getByText(/Marked as read\. \+20 points/)).toBeVisible();

  // The balance went up (switch tabs, don't reload: the fake points server lives in the page).
  await page.goBack();
  await page.getByRole('tab', { name: /Profile/ }).click();
  await expect(page.getByText('20 points')).toBeVisible();
});
