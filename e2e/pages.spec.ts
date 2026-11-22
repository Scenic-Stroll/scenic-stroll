// The public pages: welcome screen, privacy, terms, credits, and a wrong link.
import { expect, test } from '@playwright/test';

test.describe('first launch', () => {
  // A brand-new visitor: no saved session, so a fresh anonymous account and the consent screen.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('consent screen: Beta, coverage, age band, unticked opt-ins, then Start', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByText('BETA')).toBeVisible();
    await expect(page.getByText(/Smart walking routes:/)).toBeVisible();
    const start = page.getByRole('button', { name: /Start/ });
    await expect(start).toBeDisabled();

    await page.getByRole('radio', { name: 'Under 18' }).click();
    await expect(page.getByText(/Safety mode will be on/)).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /Research/ })).toHaveCount(0); // adults only

    await page.getByRole('radio', { name: '18 or over' }).click();
    for (const name of [/Research/, /Government/]) {
      await expect(page.getByRole('checkbox', { name })).not.toBeChecked();
    }
    await expect(start).toBeDisabled(); // consent not ticked yet
    await page.getByRole('checkbox', { name: /I agree to the privacy policy/ }).click();
    await start.click();
    await expect(page.getByText('BETA')).toBeHidden();
    await page.reload();
    await expect(page.getByRole('search', { name: /Search places/ })).toBeVisible();
    await expect(page.getByText('BETA')).toBeHidden(); // stored on the server
  });
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
