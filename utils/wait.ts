import { type Locator, type Page, expect } from '@playwright/test';

export type SubmitOutcome = 'dom-ok' | 'native-dialog' | 'submitted' | 'pending';

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

export async function waitForSpinnerOverlayToDisappear(page: Page, timeoutMs = 30000) {
  const spinnerOverlay = page.locator('bq-loading-spinner .loading-wrapper').first();
  if (await spinnerOverlay.isVisible().catch(() => false)) {
    await spinnerOverlay.waitFor({ state: 'hidden', timeout: timeoutMs });
  }
}

export async function waitForSubmitOutcome(
  page: Page,
  submitButton: Locator,
  okButton: Locator,
  nativeDialogSeen: () => boolean,
  timeoutMs = 60000
): Promise<SubmitOutcome> {
  const submittedHeading = page.getByRole('heading', { name: /Notification submitted/i });
  const submittedDialogHeading = page.getByRole('heading', {
    name: /notif(?:i)?cation submitted/i,
  });
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (nativeDialogSeen()) return 'native-dialog';
    if (await okButton.isVisible().catch(() => false)) return 'dom-ok';
    if (await submittedHeading.isVisible().catch(() => false)) return 'submitted';
    if (await submittedDialogHeading.isVisible().catch(() => false)) return 'submitted';
    if (!(await submitButton.isVisible().catch(() => false))) return 'submitted';

    await page.waitForTimeout(250);
  }

  return 'pending';
}
