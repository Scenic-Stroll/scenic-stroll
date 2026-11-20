// Signs in once (the app creates an anonymous account by itself) and saves the browser's storage,
// so every test reuses that one account instead of creating a new one.
import { expect, test as setup } from '@playwright/test';

setup('sign in once', async ({ page }) => {
  await page.goto('/');
  // The app keeps its Supabase session in localStorage under "sb-<project>-auth-token".
  await expect
    .poll(
      () => page.evaluate(() => Object.keys(localStorage).some((k) => k.endsWith('-auth-token'))),
      { timeout: 30_000 },
    )
    .toBe(true);
  await page.evaluate(() => localStorage.setItem('scenic-stroll:welcome-seen', '1'));
  await page.context().storageState({ path: 'e2e/.auth/session.json' });
});
