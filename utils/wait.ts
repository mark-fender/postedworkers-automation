import { Page, expect } from '@playwright/test';

export async function waitForStableLoad(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(250);
}

export async function waitAfterOpenForm(page: Page) {
  await waitForStableLoad(page);
  await expect(
    page.getByRole('heading', { name: /Service provider/i })
  ).toBeVisible({ timeout: 20000 });
}
