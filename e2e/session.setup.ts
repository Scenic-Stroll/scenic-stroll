// Signs in once (the app creates an anonymous account by itself), answers the consent screen as an
// adult, and saves the browser's storage, so every test reuses that one account.
import { expect, test as setup } from '@playwright/test';

setup('sign in once', async ({ page }) => {
  await page.goto('/');
  // First launch: the consent screen (D52). The test account is an adult.
  await page.getByRole('radio', { name: '18 or over' }).click();
  await page.getByRole('checkbox', { name: /I agree to the privacy policy/ }).click();
  await page.getByRole('button', { name: /Start/ }).click();
  await expect(page.getByRole('radio', { name: '18 or over' })).toBeHidden();
  // The app keeps its Supabase session in localStorage under "sb-<project>-auth-token".
  await expect
    .poll(
      () => page.evaluate(() => Object.keys(localStorage).some((k) => k.endsWith('-auth-token'))),
      { timeout: 30_000 },
    )
    .toBe(true);
  await page.context().storageState({ path: 'e2e/.auth/session.json' });
});
