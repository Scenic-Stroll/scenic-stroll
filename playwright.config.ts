// End-to-end tests of the web app in real browsers (DECISIONS D48, docs/TESTING.md).
//   npm run test:e2e                         → tests the production site
//   BASE_URL=https://scenic-stroll--abc.expo.app npm run test:e2e   → tests a preview
// They use the live backend, so they run one at a time and share one signed-in session
// (Supabase allows only 30 new anonymous accounts per hour per IP address).
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/report' }]],
  use: {
    baseURL: process.env.BASE_URL ?? 'https://scenic-stroll.expo.app',
    timezoneId: 'Asia/Hong_Kong',
    locale: 'en-HK',
    storageState: 'e2e/.auth/session.json',
    // Every fresh test browser would otherwise download the whole app again for the service worker:
    // that doubles the requests and tripped EAS Hosting's burst limit (HTTP 429, blank pages).
    // Only the offline test needs it (record-offline.spec.ts turns it back on).
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /session\.setup\.ts/,
      use: { storageState: { cookies: [], origins: [] } },
    },
    {
      name: 'phone-chromium',
      use: { ...devices['Pixel 7'] },
      dependencies: ['setup'],
    },
    {
      name: 'phone-webkit',
      use: { ...devices['iPhone 15'] },
      dependencies: ['setup'],
    },
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      dependencies: ['setup'],
    },
    {
      name: 'desktop-webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } },
      dependencies: ['setup'],
    },
  ],
});
