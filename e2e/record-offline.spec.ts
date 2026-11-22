// Recording a route on the web: it is saved in the browser while offline and uploads by itself
// when the connection comes back. The upload is answered by a fake inside the page, so tests never
// add routes to the live database.
import { expect, test } from '@playwright/test';

// The installed app's service worker is what makes screens open offline.
test.use({ serviceWorkers: 'allow' });

// A fake GPS: allows location and walks ~400 m north-west from Kowloon Tong Exit C1, one point
// per 100 ms of real time, each stamped 10 s apart (2 m/s — a brisk walk, below the 3 m/s jump
// filter).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const start = { lat: 22.33696, lng: 114.17553 };
    const STEP_DEG = 0.00013; // ≈ 14 m north + 14 m west ≈ 20 m per point
    let t0 = Date.now();
    const fix = (i: number) => ({
      coords: {
        latitude: start.lat + i * STEP_DEG,
        longitude: start.lng - i * STEP_DEG,
        accuracy: 5,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: 2,
      },
      timestamp: t0 + i * 10_000,
    });
    let watchers: { cb: (p: unknown) => void; i: number; timer: number }[] = [];
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (ok: (p: unknown) => void) => setTimeout(() => ok(fix(0)), 10),
        watchPosition: (cb: (p: unknown) => void) => {
          t0 = Date.now();
          const w = { cb, i: 0, timer: 0 };
          w.timer = window.setInterval(() => w.i <= 20 && cb(fix(w.i++)), 100);
          watchers.push(w);
          return watchers.length;
        },
        clearWatch: (id: number) => {
          clearInterval(watchers[id - 1]?.timer);
        },
      },
    });
    // Fake upload server. Replacing fetch inside the page (not Playwright's page.route) because
    // WebKit sends requests from a page with a service worker past page.route — an earlier
    // version of this test created real routes that way (DECISIONS D48).
    const realFetch = window.fetch.bind(window);
    (window as unknown as { e2eUploads: unknown[] }).e2eUploads = [];
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes('/rest/v1/rpc/create_route')) return realFetch(input, init);
      if (!navigator.onLine) throw new TypeError('Failed to fetch'); // what the browser does offline
      (window as unknown as { e2eUploads: unknown[] }).e2eUploads.push(
        JSON.parse(String(init?.body)),
      );
      return new Response(JSON.stringify(crypto.randomUUID()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    if (navigator.permissions) {
      const query = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = (d: PermissionDescriptor) =>
        d.name === 'geolocation'
          ? Promise.resolve({ state: 'granted', onchange: null } as unknown as PermissionStatus)
          : query(d);
    }
  });
});

test('a recording made offline is kept and uploads when back online', async ({ page, context }) => {
  const uploads = () =>
    page.evaluate(
      () => (window as unknown as { e2eUploads: { payload: { title: string } }[] }).e2eUploads,
    );

  await page.goto('/');
  await page.getByRole('button', { name: 'Record a route' }).first().click();
  await page.getByRole('button', { name: 'Start recording' }).click();
  await expect(page.getByText(/^0\.[3-9] km|^[3-9]\d\d m/)).toBeVisible({ timeout: 30_000 });

  // The installed app (service worker) has saved every screen, so the review screen opens offline.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  page.once('dialog', (d) => void d.accept()); // "Stop recording?" → OK
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('E2E test walk');
  await page.getByRole('button', { name: /Save & upload/ }).click();
  // Saved in the browser, waiting for the internet.
  await page.getByRole('tab', { name: /Routes/ }).click();
  await expect(
    page.getByRole('button', { name: 'E2E test walk, Waiting to upload' }),
  ).toBeVisible();
  expect(await uploads()).toHaveLength(0);

  // Back online: it uploads by itself.
  await context.setOffline(false);
  await expect.poll(async () => (await uploads()).length, { timeout: 30_000 }).toBe(1);
  expect((await uploads())[0]?.payload.title).toBe('E2E test walk');
  await expect(page.getByRole('button', { name: 'E2E test walk, Uploaded' })).toBeVisible();
});
