import { expect, type Page } from '@playwright/test';

import { setCheckboxByLabel } from './elements';
import {
  waitForStableLoad,
  waitForSpinnerOverlayToDisappear,
} from './wait';

export async function dismissMessagesForYouModalIfPresent(page: Page) {
  const messagesForYou = page.getByText(/Messages for you/i).first();
  if (!(await messagesForYou.isVisible({ timeout: 2000 }).catch(() => false))) {
    return;
  }

  await setCheckboxByLabel(page, /Do not show this message again/i);

  const modal = page.locator('.modal-content', { hasText: /Messages for you/i }).first();
  const modalOkButton = modal.getByRole('button', { name: /^OK$/i }).first();
  if (await modalOkButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await modalOkButton.click();
  } else {
    await page.getByRole('button', { name: /^OK$/i }).first().click();
  }
  await waitForStableLoad(page);
}

export async function dismissNotificationSubmittedModalIfPresent(page: Page) {
  const submittedDialog = page
    .locator(
      '.cdk-overlay-container cdk-dialog-container[role="dialog"][aria-modal="true"] .modal.modal--open'
    )
    .filter({ hasText: /(?:New\s+)?notif(?:i)?cation\s+submitted/i })
    .first();

  if (
    !(await submittedDialog
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => true)
      .catch(() => false))
  ) {
    return;
  }

  const modalOkButton = submittedDialog
    .locator('button')
    .filter({ hasText: /^\s*OK\s*$/ })
    .first();

  await expect(modalOkButton, 'OK button in the notification submitted modal').toBeVisible();

  try {
    await modalOkButton.click({ timeout: 5000 });
  } catch {
    console.log('Standard modal OK click failed, falling back to DOM click()');
    await modalOkButton.evaluate((element: HTMLElement) => element.click());
  }

  await expect(submittedDialog, 'Notification submitted modal should close').not.toBeVisible();
  await expect(
    page.locator('.cdk-overlay-backdrop.cdk-overlay-backdrop-showing'),
    'Notification submitted modal backdrop should disappear'
  ).not.toBeVisible();
  await waitForSpinnerOverlayToDisappear(page, 10000).catch(() => {});
}

export async function clickLogout(page: Page) {
  await waitForSpinnerOverlayToDisappear(page, 10000).catch(() => {});

  let logoutLink = page
    .locator('a:visible')
    .filter({ hasText: /Employer\/self-employed/i })
    .filter({ hasText: /\bLogout\b/i })
    .first();

  if (!(await logoutLink.isVisible({ timeout: 5000 }).catch(() => false))) {
    await page
      .getByRole('menuitem', { name: /My notification/i })
      .click({ timeout: 3000 })
      .catch(() => {});
    await waitForSpinnerOverlayToDisappear(page, 10000).catch(() => {});

    logoutLink = page
      .locator('a:visible')
      .filter({ hasText: /\bLogout\b/i })
      .first();
  }

  await expect(logoutLink, 'Visible logout link in the page header').toBeVisible({ timeout: 10000 });
  await logoutLink.scrollIntoViewIfNeeded({ timeout: 5000 });

  try {
    const box = await logoutLink.boundingBox();
    if (box && box.width > 2 && box.height > 2) {
      await logoutLink.click({
        timeout: 5000,
        position: {
          x: Math.min(Math.max(box.width - 24, 1), box.width - 1),
          y: Math.min(Math.max(box.height / 2, 1), box.height - 1),
        },
      });
    } else {
      await logoutLink.click({ timeout: 5000 });
    }
  } catch (error) {
    console.log(
      `Standard logout click failed, falling back to DOM click(): ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    await logoutLink.evaluate((element: HTMLElement) => element.click(), undefined, {
      timeout: 5000,
    });
  }

  const loginEntryPoint = page
    .locator('input#userId, select#otherServiceIndex, button#anders_inloggen_button_tekst[name="start-login"]')
    .first();

  try {
    await Promise.any([
      page.waitForURL(/\/runtime\/start-login|login|logout/i, { timeout: 15000 }),
      loginEntryPoint.waitFor({ state: 'visible', timeout: 15000 }),
      logoutLink.waitFor({ state: 'hidden', timeout: 15000 }),
    ]);
  } catch {
    throw new Error('Logout click did not navigate to login or hide the Logout link within 15 seconds');
  }

  await expect(logoutLink, 'Logout link should disappear after clicking logout').not.toBeVisible({
    timeout: 5000,
  });
}
