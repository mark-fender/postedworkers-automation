import 'dotenv/config';

// playwright.config note: ensure "use": { "baseURL": "" } if you prefer, but we use absolute URL here.

import { test, expect, Page, Locator } from '@playwright/test';
import workLocation from '../work_location.json';

// -------------------------------
// Helpers
// -------------------------------
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

async function waitForStableLoad(page: Page) {
  await page.waitForLoadState('networkidle');
  // Occasionally Angular/Mat reflows, add a tiny settle
  await page.waitForTimeout(250);
}

async function waitAfterOpenForm(page: Page) {
  await waitForStableLoad(page);
  await expect(
    page.getByRole('heading', { name: /Service provider/i })
  ).toBeVisible({ timeout: 15000 });
}

async function selectMatOption(page: Page, optionText: string) {
  // Try standard ARIA role lookup first
  try {
    const option = page.getByRole('option', { name: optionText, exact: true });
    await option.waitFor({ state: 'visible', timeout: 1000 });
    await option.click({ timeout: 1000 });
    return;
  } catch {}

  // Fallback to mat-option element search
  try {
    const option = page.locator('mat-option', { hasText: optionText }).first();
    await option.waitFor({ state: 'visible', timeout: 1000 });
    await option.click({ timeout: 1000 });
    return;
  } catch {}

  // Last resort: text lookup anywhere in option list
  const fallback = page.locator(`text="${optionText}"`).first();
  await fallback.waitFor({ state: 'visible', timeout: 1000 });
  await fallback.click();
}

async function setInputValue(input: Locator, value: string) {
  await input.click({ timeout: 1000 });
  await input.fill(value);
  if ((await input.inputValue()) !== value) {
    await input.fill('');
    await input.pressSequentially(value);
  }
  await expect(input).toHaveValue(value);
  // Dismiss any date picker overlays that might block subsequent fields
  await input.press('Tab').catch(() => {});
}

async function fillTextByLabel(page: Page, labelText: string, value: string) {
  // Try straightforward accessible lookup first
  try {
    const field = page.getByLabel(labelText, { exact: true });
    await expect(field).toBeVisible({ timeout: 1000 });
    await setInputValue(field, value);
    return;
  } catch {}

  // Fallback: locate label manually and resolve its target input
  const label = page.locator(`label:has-text("${labelText}")`).first();
  await label.waitFor({ state: 'visible', timeout: 1000 });
  const forAttr = await label.getAttribute('for');
  let input = forAttr
    ? page.locator(`#${forAttr}`)
    : label.locator('xpath=..').locator('input, textarea').first();

  await expect(input).toBeVisible({ timeout: 1000 });
  await setInputValue(input, value);
}

async function selectMatOptionByLabel(page: Page, labelText: string, optionText: string) {
  // First attempt: use accessible label and option roles
  try {
    const field = page.getByLabel(labelText, { exact: true });
    await field.click({ timeout: 1000 });
    await selectMatOption(page, optionText);
    return;
  } catch {}

  // Fallback: locate custom bq-select container by label text
  try {
    const container = page.locator('bq-select', {
      has: page.locator(`label:has-text("${labelText}")`),
    });
    await container.waitFor({ state: 'visible', timeout: 1000 });
    const trigger = container.locator('.mat-mdc-select-trigger');
    await trigger.click({ timeout: 1000 });
    await selectMatOption(page, optionText);
    return;
  } catch {}

  // Last resort: click the label's "for" target and pick the option by text
  const label = page.locator(`label:has-text("${labelText}")`).first();
  await label.waitFor({ state: 'visible', timeout: 1000 });
  const forAttribute = await label.getAttribute('for');
  if (forAttribute) {
    await page.locator(`#${forAttribute}`).click({ timeout: 1000 });
  } else {
    await label.click({ timeout: 1000 });
  }
  await selectMatOption(page, optionText);
}

async function setRadioByLabel(
  page: Page,
  groupLabel: string | RegExp,
  optionText: string
) {
  // Try accessible role-based lookup first
  try {
    const group = page.getByRole('radiogroup', { name: groupLabel });
    const option = group.getByLabel(optionText, { exact: true });
    await option.check({ timeout: 1000 });
    return;
  } catch {}

  // Fallback: locate the custom radio container by label text and click the option label
  try {
    const container = page.locator('bq-radio-button', {
      has: page.locator('label', { hasText: groupLabel }),
    });
    await container.waitFor({ state: 'visible', timeout: 1000 });
    const optionLabel = container.locator('label', { hasText: optionText }).first();
    await optionLabel.click({ timeout: 1000 });
    return;
  } catch {}

  // Last resort: rely on unique option label without group context
  const fallback = page.getByLabel(optionText, { exact: true });
  await expect(fallback).toBeVisible();
  await fallback.check();
}

async function setCheckboxByLabel(
  page: Page,
  labelText: string | RegExp
) {
  // Try accessible role or label lookup first
  try {
    const checkbox = page.getByRole('checkbox', { name: labelText });
    await checkbox.check({ timeout: 1000 });
    return;
  } catch {}

  try {
    const checkbox = page.getByLabel(labelText, { exact: true });
    await checkbox.check({ timeout: 1000 });
    return;
  } catch {}

  // Fallback: locate custom checkbox container by label text
  try {
    const container = page.locator('bq-checkbox', {
      has: page.locator('label', { hasText: labelText }),
    });
    await container.waitFor({ state: 'visible', timeout: 1000 });
    // Some custom checkbox implementations hide the native input,
    // making check() unreliable. Click the label instead so the
    // associated input toggles regardless of visibility.
    const label = container.locator('label', { hasText: labelText }).first();
    await label.click({ timeout: 1000 });
    return;
  } catch {}

  // Last resort: resolve via label "for" attribute
  const label = page.locator('label', { hasText: labelText }).first();
  await label.waitFor({ state: 'visible', timeout: 1000 });
  const forAttr = await label.getAttribute('for');
  const input = forAttr
    ? page.locator(`#${forAttr}`)
    : label.locator('input[type="checkbox"]').first();
  try {
    await input.check({ timeout: 1000 });
  } catch {
    // Fallback: if the input is hidden, clicking the label still
    // toggles the checkbox.
    await label.click({ timeout: 1000 });
  }
}

async function clickProceed(page: Page, buttonText: string = 'Next') {
  await page.getByRole('button', { name: buttonText }).click();
  await waitForStableLoad(page);
}

function formatDateToDutchLocale(dotDate: string): string {
  // input: DD.MM.YYYY  -> output: DD-MM-YYYY
  return dotDate.replace(/\./g, '-');
}

async function pdokLookupPostalCode(page: Page, street: string, houseNumber: string, city: string): Promise<string> {
  // PDOK free geocoding lookup; we try to obtain a postcode by a combined query
  const query = `${street} ${houseNumber}, ${city}`;
  const lookupUrl =
    `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(query)}&rows=5`;
  const response = await page.request.get(lookupUrl);
  if (!response.ok()) {
    throw new Error(`PDOK request failed with status ${response.status()}`);
  }
  const responseData = await response.json();
  const docs = (responseData as any)?.response?.docs || [];
  for (const doc of docs) {
    const postcode = doc?.postcode || doc?.postalcode || doc?.pc6;
    if (postcode) return postcode;
  }
  throw new Error(`PDOK: No postcode found for query: ${query}`);
}

// -------------------------------
// Main test
// -------------------------------
test('End-to-end notification flow', async ({ page }) => {
  // SECTION 1 — Login and open new notification
  await page.goto('https://meldloket.postedworkers.nl/runtime/start-login?lang=en');
  await waitForStableLoad(page);

  // Close cookie modal if present
  const cookieModal = page.locator('.modal-content .modal-title', { hasText: 'Cookie Statement' });
  if (await cookieModal.isVisible({ timeout: 2000 }).catch(() => false)) {
    const okButton = page.locator('.modal-footer .cookie-button', { hasText: 'OK' });
    await okButton.click();
    await waitForStableLoad(page);
  }

  // Select “Employer or self-employed”
  const loginAs = page.locator('select#otherServiceIndex');
  await expect(loginAs).toBeVisible();
  await loginAs.selectOption({ value: '6' });

  // Click the “Login” button that reveals the actual login page
  await page.click('button#anders_inloggen_button_tekst[name="start-login"]');
  await waitForStableLoad(page);

  // Perform login (SSO or credentials UI depending on environment).
  // Adjust selectors if your login form differs.
  await page.fill('input[id="userId"]', requireEnv('LOGIN_EMAIL'));
  await page.fill('input[id="password"]', requireEnv('LOGIN_PASSWORD'));
  await page.click('button[type="submit"]');
  await waitForStableLoad(page);

  // Open new notification (use provided selector)
  await page.getByRole('menuitem', { name: 'New notification' }).click();
  await waitAfterOpenForm(page);

  // SECTION 2 — First form page: worker/project basics
  // Are you self-employed? -> Yes
  await setRadioByLabel(page, 'Are you self-employed?', 'Yes');

  // Once-a-year notification? -> No
  await setRadioByLabel(page, 'Once-a-year notification?', 'No');

  // Sector -> F. Construction
  await selectMatOptionByLabel(page, 'Sector', 'F. Construction');

  // Subsector -> 41 Construction of buildings and development of building projects
  await selectMatOptionByLabel(page, 'Subsector', '41 Construction of buildings and development of building projects');

  // Branch code -> 4120 Construction of residential and non-residential buildings
  await selectMatOptionByLabel(page, 'Branch code', '4120 Construction of residential and non-residential buildings');

  // Country of establishment -> Slovakia
  await selectMatOptionByLabel(page, 'Country of establishment', 'Slovakia');

  // Posting dates from JSON (convert to DD-MM-YYYY)
  const startDate = formatDateToDutchLocale(workLocation.start_date);
  const endDate = formatDateToDutchLocale(workLocation.end_date);

  await fillTextByLabel(page, 'Scheduled start date of the posting', startDate);
  await fillTextByLabel(page, 'Scheduled end date of the posting', endDate);

  // Next to Notifier details
  await clickProceed(page);

  // SECTION 3 — Notifier personal details
  await fillTextByLabel(page, 'First name', requireEnv('NOTIFIER_FIRST_NAME'));
  await fillTextByLabel(page, 'Surname', requireEnv('NOTIFIER_LAST_NAME'));

  // Only Mobile phone number is required
  await fillTextByLabel(page, 'Mobile phone number', requireEnv('NOTIFIER_PHONE'));

  await fillTextByLabel(page, 'E-mail address', requireEnv('NOTIFIER_EMAIL'));

  // Next to Notifier company details
  await clickProceed(page);

  // SECTION 4 — Notifier company details

  // Country of establishment -> Slovakia
  await selectMatOptionByLabel(page, 'Country of establishment', 'Slovakia');

  // Dutch Chamber of Commerce? -> No
  await setRadioByLabel(page, 'Dutch Chamber of Commerce?', 'No');

  // Foreign Chamber of Commerce? -> Yes
  await setRadioByLabel(page, 'Foreign Chamber of Commerce?', 'Yes');

  // Chamber number from env
  await fillTextByLabel(page, 'Chamber of Commerce registration number', requireEnv('NOTIFIER_CHAMBER_NUMBER'));

  // Company name = first + last
  const notifierCompany = `${requireEnv('NOTIFIER_FIRST_NAME')} ${requireEnv('NOTIFIER_LAST_NAME')}`;
  await fillTextByLabel(page, 'Company name', notifierCompany);

  // VAT identification: “The company does not have a VAT identification number...”
  await setRadioByLabel(page, 'Does the company have a VAT identification number?', 'The company does not have a VAT identification number');

  // Notifier address (fill full address)
  await fillTextByLabel(page, 'Street', requireEnv('NOTIFIER_STREET'));
  await fillTextByLabel(page, 'House number', requireEnv('NOTIFIER_HOUSE_NUMBER'));
  await fillTextByLabel(page, 'City', requireEnv('NOTIFIER_CITY'));
  await fillTextByLabel(page, 'Postal code', requireEnv('NOTIFIER_POSTCODE'));

  // Reporter and self-employed are the same person -> Yes
  await setRadioByLabel(page, 'The reporter and the self-employed person are the same person', 'Yes');

  // Date of birth
  await fillTextByLabel(page, 'Date of birth', requireEnv('NOTIFIER_DATE_OF_BIRTH'));

  // Nationality -> Slovakia
  await selectMatOptionByLabel(page, 'Nationality', 'Slovakia');

  // Next to Service recipient section
  await clickProceed(page);

  // SECTION 5 — Service recipient: type, KVK lookup, VAT, address, contact
  // Type of service recipient -> Company
  await setRadioByLabel(page, 'Type of service recipient', 'Company');

  // Country of establishment -> Netherlands (EEA)
  await selectMatOptionByLabel(page, 'Country of establishment', 'Netherlands (EEA)');

  // KVK + Branch number → search
  await fillTextByLabel(
    page,
    'Dutch Chamber of Commerce registration number (KvK-nummer)',
    requireEnv('SERVICE_RECIPIENT_KVK_NUMBER')
  );
  await fillTextByLabel(
    page,
    'Branch number',
    requireEnv('SERVICE_RECIPIENT_BRANCH_NUMBER')
  );
  
  await page.getByRole('button', { name: 'Search in the Dutch trade register' }).click();
  await waitForStableLoad(page);

  // Confirm result: click the "Select" action if available
  try {
    const selectButtons = page.locator('text=Select', { hasText: 'Select' });
    const count = await selectButtons.count();
    if (count > 0) {
      await selectButtons.first().click({ timeout: 3000 });
    } else {
      throw new Error('No "Select" button found');
    }
    await waitForStableLoad(page);
  } catch {
    // Fallback: choose manual entry and close result dialog
    const manualOption = page.getByLabel('No, enter company details manually', {
      exact: true,
    });
    await manualOption.click({ timeout: 1000 }).catch(() => {});
    // Click the button whose tooltip contains "Close"
    const tooltipButtons = page.locator('button[aria-describedby]');
    const buttonCount = await tooltipButtons.count();
    for (let i = 0; i < buttonCount; i++) {
      const candidate = tooltipButtons.nth(i);
      const tooltipId = await candidate.getAttribute('aria-describedby');
      if (!tooltipId) continue;
      const tooltipText = (await page.locator(`#${tooltipId}`).textContent()) || '';
      if (tooltipText.includes('Close')) {
        await candidate.click();
        break;
      }
    }
    await waitForStableLoad(page);

    // Reveal additional options before manual company entry
    await page.getByText('More search options', { exact: true }).click();
    await waitForStableLoad(page);

    // Ensure manual company entry is selected and provide company name
    await setRadioByLabel(
      page,
      "Do you want to use the company's details from the Dutch trade register?",
      'No, enter company details manually'
    );
    await waitForStableLoad(page);

    await fillTextByLabel(
    page,
    'Dutch Chamber of Commerce registration number (KvK-nummer)',
    requireEnv('SERVICE_RECIPIENT_KVK_NUMBER')
    );
    await fillTextByLabel(
      page,
      'Company name',
      requireEnv('SERVICE_RECIPIENT_COMPANY_NAME')
    );
  }

  // VAT identification number
  await setRadioByLabel(
    page,
    'Does the company have a VAT identification number?',
    'Yes'
  );
  await fillTextByLabel(
    page,
    'VAT identification number *',
    requireEnv('SERVICE_RECIPIENT_VAT_NUMBER')
  );

  // Address selection strategy: Provide manually -> No
  await setRadioByLabel(page, 'Provide manually', 'No');

  // Fill postcode + house number from env
  await fillTextByLabel(
    page,
    'Postal code in the Netherlands',
    requireEnv('SERVICE_RECIPIENT_POSTCODE')
  );
  await fillTextByLabel(page, 'House number', requireEnv('SERVICE_RECIPIENT_HOUSE_NUMBER'));

  // Contact info
  await fillTextByLabel(
    page,
    'First name',
    requireEnv('SERVICE_RECIPIENT_CONTACT_FIRST_NAME')
  );
  await fillTextByLabel(
    page,
    'Surname',
    requireEnv('SERVICE_RECIPIENT_CONTACT_LAST_NAME')
  );
  await fillTextByLabel(page, 'Phone number', requireEnv('SERVICE_RECIPIENT_PHONE'));
  await fillTextByLabel(page, 'E-mail address', requireEnv('SERVICE_RECIPIENT_EMAIL'));

  // Next to Work location section
  await clickProceed(page);

  // SECTION 6 — Address/place where work will be performed
  // Does the workplace in NL have a known address? -> Yes
  await setRadioByLabel(
    page,
    'Does the workplace in the Netherlands have a known address?',
    'Yes'
  );

  // Provide manually -> No
  await setRadioByLabel(page, 'Provide manually', 'No');

  // Derive postcode from PDOK using JSON street/city/houseNumber, then fill
  const workLocationStreet = workLocation.street;
  const workLocationCity = workLocation.city;
  const workLocationHouseNumber = workLocation.house_number;
  const derivedPostcode = await pdokLookupPostalCode(
    page,
    workLocationStreet,
    workLocationHouseNumber,
    workLocationCity
  );

  await fillTextByLabel(
    page,
    'Postal code in the Netherlands',
    derivedPostcode
  );
  await fillTextByLabel(page, 'House number', workLocationHouseNumber);

  // Work-location contact: phone + email from service recipient (env)
  await fillTextByLabel(
    page,
    'Phone number',
    requireEnv('SERVICE_RECIPIENT_PHONE')
  );
  await fillTextByLabel(
    page,
    'E-mail address',
    requireEnv('SERVICE_RECIPIENT_EMAIL')
  );

  // A1 coverage section
  await setRadioByLabel(
    page,
    'Do you have an A1-certificate of coverage?',
    'Yes'
  );
  await selectMatOptionByLabel(
    page,
    'Country of issue',
    'Slovakia (EEA)'
  );

  // Go to summary
  await clickProceed(page, 'Summary');

  // SECTION 7 — Summary: confirm declaration and submit
  await setCheckboxByLabel(
    page,
    /With this I declare all questions have been answered truthfully\./
  );
  // await page.getByRole('button', { name: /Submit notification/i }).click();

  // Logout
  await waitForStableLoad(page);
  await page.getByText('Logout', { exact: false }).click();
  await waitForStableLoad(page);
});
