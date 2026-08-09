import { expect, test } from '@playwright/test';
import { dismissNotificationSubmittedModalIfPresent } from '../utils/session';

test('closes the submitted-notification dialog with the portal’s misspelled heading', async ({ page }) => {
  await page.setContent(`
    <div id="overlay">
      <div class="cdk-overlay-backdrop cdk-overlay-backdrop-showing"></div>
      <cdk-dialog-container role="dialog">
        <h2>New notifcation submitted</h2>
        <button class="ModalCloseButton" onclick="document.querySelector('#overlay')?.remove()">
          <span class="button-caption">OK</span>
        </button>
      </cdk-dialog-container>
    </div>
  `);

  await dismissNotificationSubmittedModalIfPresent(page);

  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('.cdk-overlay-backdrop.cdk-overlay-backdrop-showing')).not.toBeVisible();
});
