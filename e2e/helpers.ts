// Shared steps for the end-to-end tests.
import { expect, type Page } from '@playwright/test';

/** The route planning panel: a bottom sheet on phones, a side panel on wide screens. */
export const planner = (page: Page) => page.getByLabel('Route planning', { exact: true });

/** Picks a place in the "Go to" / "Start from" picker by typing part of its name. */
export async function pickPlace(page: Page, search: string, name: RegExp) {
  await page.getByRole('textbox', { name: 'Search places' }).fill(search);
  await page.getByRole('dialog').getByRole('button', { name }).click();
}

/** Plans Kowloon Tong Exit A1 → Mong Man-wai Building, the demo trip from the brief. */
export async function planDemoTrip(page: Page) {
  await page.goto('/');
  await page.getByRole('search', { name: /Search places/ }).click();
  await pickPlace(page, 'Mong Man', /^Mong Man-wai Building \(MMW\),/);
  await page.getByRole('button', { name: 'Route here' }).click();
  await planner(page).getByRole('button', { name: 'From: Choose start' }).click();
  await pickPlace(page, 'Exit A1', /^Kowloon Tong Exit A1,/);
  await expect(
    planner(page).getByRole('button', { name: 'From: Kowloon Tong Exit A1' }),
  ).toBeVisible();
}
