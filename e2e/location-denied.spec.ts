// Saying no to location access: the app explains how to fix it and still plans routes.
import { expect, test } from '@playwright/test';

import { planDemoTrip, planner } from './helpers';

// Behave like a browser where the person tapped "Block": every location request fails with
// PERMISSION_DENIED. (Headless browsers otherwise leave the permission prompt open forever.)
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const denied = { code: 1, message: 'User denied Geolocation', PERMISSION_DENIED: 1 };
    const fail = (_ok: unknown, error?: (e: unknown) => void) => {
      setTimeout(() => error?.(denied), 10);
      return 0;
    };
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: fail, watchPosition: fail, clearWatch: () => {} },
    });
    const query = navigator.permissions?.query.bind(navigator.permissions);
    if (navigator.permissions) {
      navigator.permissions.query = (d: PermissionDescriptor) =>
        d.name === 'geolocation'
          ? Promise.resolve({ state: 'denied', onchange: null } as unknown as PermissionStatus)
          : query!(d);
    }
  });
});

test('location denied: a clear message, and planning still works with a picked start', async ({
  page,
}) => {
  await page.goto('/');
  // The web app explains with a browser alert; read it and close it.
  let message = '';
  page.once('dialog', (dialog) => {
    message = dialog.message();
    void dialog.dismiss();
  });
  await page.getByRole('button', { name: 'Show my location' }).click();
  await expect.poll(() => message).toContain('pick a start from the list');

  // The planner starts with "Choose start" instead of "My location", and works from a picked place.
  await planDemoTrip(page);
  await expect(
    planner(page)
      .getByRole('button', { name: /, \d+ min, / })
      .first(),
  ).toBeVisible();
});
