// The public pages: welcome screen, privacy, terms, credits, and a wrong link.
import { expect, test } from '@playwright/test';

test('first visit shows the welcome screen with Beta, coverage and Start', async ({ page }) => {
  // Forget "welcome seen" once (not on the reload below, which checks it's remembered).
  await page.addInitScript(() => {
    if (sessionStorage.getItem('e2e-welcome-reset')) return;
    sessionStorage.setItem('e2e-welcome-reset', '1');
    localStorage.removeItem('scenic-stroll:welcome-seen');
  });
  await page.goto('/');
  await expect(page.getByText('BETA')).toBeVisible();
  await expect(page.getByText(/Smart walking routes:/)).toBeVisible();
  await expect(page.getByText(/Transport comparison:/)).toBeVisible();
  await page.getByRole('button', { name: /Start/ }).click();
  await expect(page.getByText('BETA')).toBeHidden();
  await page.reload();
  await expect(page.getByRole('search', { name: /Search places/ })).toBeVisible();
  await expect(page.getByText('BETA')).toBeHidden(); // remembered
});

for (const [path, heading] of [
  ['/privacy', 'Your location — what, why and how long'],
  ['/terms', 'Use your own judgement'],
] as const) {
  test(`${path} loads and is marked as a draft`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(page.getByText(/Draft for the Scenic Stroll team to review/)).toBeVisible();
  });
}

test('/attribution lists the data sources', async ({ page }) => {
  await page.goto('/attribution');
  await expect(page.getByText(/OpenStreetMap contributors/).first()).toBeVisible();
  await expect(page.getByText(/Hong Kong Observatory/)).toBeVisible();
  await expect(page.getByText(/Lands Department/).first()).toBeVisible();
});

test('a wrong link shows "Page not found" with a way back', async ({ page }) => {
  await page.goto('/no-such-page');
  await expect(page.getByText('Page not found')).toBeVisible();
  await page.getByRole('button', { name: /Go to the map/ }).click();
  await expect(page.getByRole('search', { name: /Search places/ })).toBeVisible();
});
