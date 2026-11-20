// Planning a walk: route options with cover/shade, step-free, and the transport comparison.
import { expect, test } from '@playwright/test';

import { pickPlace, planDemoTrip, planner } from './helpers';

test('Exit A1 → Mong Man-wai Building shows computed routes with cover and shade', async ({
  page,
}) => {
  await planDemoTrip(page);
  const options = planner(page).getByRole('button', { name: /route.*, \d+ min, / });
  await expect(options.first()).toBeVisible();
  // Every computed option says how much of it is covered; "% shaded" is added while the sun is up.
  await expect(
    planner(page)
      .getByText(/\d+% covered/)
      .first(),
  ).toBeVisible();
  await expect(
    planner(page).getByRole('button', { name: /^Standard walking route/ }),
  ).toBeVisible();
});

test('Step-free: the chosen route has no stairs or escalators', async ({ page }) => {
  await planDemoTrip(page);
  await planner(page).getByRole('tab', { name: 'Step-free', exact: true }).click();
  const stepFree = planner(page).getByRole('button', { name: /^Step-free route, / });
  await expect(stepFree).toBeVisible();
  await expect(planner(page).getByText('No stairs or escalators')).toBeVisible();
  const steps = await planner(page)
    .getByRole('list')
    .filter({ hasText: 'Directions' })
    .locator('[aria-label^="Step "]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
  expect(steps.length).toBeGreaterThan(0);
  expect(steps.filter((s) => /stairs|escalator/i.test(s))).toEqual([]);
});

test('"All" compares walking, public transport, car and taxi', async ({ page }) => {
  // Exit A1 → Mong Man-wai Building is too short for the MTR or a bus to beat walking (the app
  // says so), so this test goes further: Exit A1 → Tsim Sha Tsui (about 5 km).
  await page.goto('/');
  await page.getByRole('search', { name: /Search places/ }).click();
  await page.getByRole('textbox', { name: 'Search places' }).fill('Tsim Sha Tsui Station');
  await page.getByRole('dialog').getByRole('button', { name: 'Search', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Tsim Sha Tsui/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Route here' }).click();
  const panel = planner(page);
  await panel.getByRole('button', { name: 'From: Choose start' }).click();
  await pickPlace(page, 'Exit A1', /^Kowloon Tong Exit A1,/);
  await panel.getByRole('tab', { name: /^All/ }).click();
  // Leave at 10:00 (tomorrow if it's later now), so trains and buses are running whatever time
  // the test runs.
  await panel.getByRole('button', { name: 'At…' }).click();
  await panel.getByLabel('Leave at').fill('10:00');
  await panel.getByRole('button', { name: 'Done' }).click();

  // Each travel mode tab shows a time once its answer is in…
  for (const mode of [/^Walk · \d/, /^Transit · \d/, /^Car · \d/, /^Taxi · \d/]) {
    await expect(panel.getByRole('tab', { name: mode })).toBeVisible();
  }
  // …and the "All" list holds options of every kind.
  const options = panel.getByRole('button', { name: /, (\d+ h )?\d+ min, arrive / });
  await expect(options.filter({ hasText: /Walk/ }).first()).toBeVisible();
  await expect(options.filter({ hasText: /Car via/ }).first()).toBeVisible();
  await expect(options.filter({ hasText: /Taxi via/ }).first()).toBeVisible();
  const names = await options.evaluateAll((els) =>
    els.map((e) => e.getAttribute('aria-label') ?? ''),
  );
  expect(names.some((n) => !/^(Walk|Car via|Taxi via)/.test(n))).toBe(true); // a public transport trip
});
