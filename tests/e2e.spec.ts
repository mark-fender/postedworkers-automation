import 'dotenv/config';

// playwright.config note: ensure "use": { "baseURL": "" } if you prefer, but we use absolute URL here.

import { test, expect, Page, Locator } from '@playwright/test';
import workLocation from '../work_location.json';

// -------------------------------
// Helpers
// -------------------------------
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v.trim();
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

async function fillTextInTestIdInput(page: Page, testId: string, value: string) {
  const field = page.getByTestId(testId).locator('input, textarea');
  await expect(field).toBeVisible();
  await field.fill(value);
}

async function clickByTestId(page: Page, testId: string) {
  const el = page.getByTestId(testId);
  await expect(el).toBeVisible();
  await el.click();
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

async function selectMatOptionByText(page: Page, testId: string, optionText: string) {
  try {
    await clickByTestId(page, testId);
  } catch {}

  try {
    await selectMatOption(page, optionText);
    return;
  } catch {}

  // Fallback: open the mat-select trigger within the testId container
  const container = page.getByTestId(testId);
  const trigger = container.locator('.mat-mdc-select-trigger');
  await trigger.click({ timeout: 1000 });
  await selectMatOption(page, optionText);
}

async function setRadioByTestId(page: Page, groupTestId: string, valueTrueFalse: 'true'|'false') {
  const container = page.getByTestId(groupTestId);
  const radio = container.locator(`input[type="radio"][value="${valueTrueFalse}"]`);
  await expect(radio).toBeVisible();
  await radio.check();
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
  const forAttr = await label.getAttribute('for');
  if (forAttr) {
    await page.locator(`#${forAttr}`).click({ timeout: 1000 });
  } else {
    await label.click({ timeout: 1000 });
  }
  await selectMatOption(page, optionText);
}

async function setRadioByLabel(page: Page, groupLabel: string, optionText: string) {
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
      has: page.locator(`label:has-text("${groupLabel}")`),
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

async function clickNext(page: Page, buttonText: string = 'Next') {
  await page.getByRole('button', { name: buttonText }).click();
  await waitForStableLoad(page);
}

function formatDateToDutchLocale(dotDate: string): string {
  // input: DD.MM.YYYY  -> output: DD-MM-YYYY
  return dotDate.replace(/\./g, '-');
}

async function pdokLookupPostalCode(page: Page, street: string, houseNumber: string, city: string): Promise<string> {
  // PDOK free geocoding lookup; we try to obtain a postcode by a combined query
  const q = `${street} ${houseNumber}, ${city}`;
  const url = `https://geocoding-api.pdok.nl/v3/free?q=${encodeURIComponent(q)}&limit=5`;
  const resp = await page.request.get(url);
  if (!resp.ok()) {
    throw new Error(`PDOK request failed with status ${resp.status()}`);
  }
  const data = await resp.json();
  const features = (data as any)?.features || [];
  for (const f of features) {
    const pc = f?.properties?.postcode || f?.properties?.postalcode;
    if (pc) return pc;
  }
  throw new Error(`PDOK: No postcode found for query: ${q}`);
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
  const start = formatDateToDutchLocale(workLocation.start_date);
  const end = formatDateToDutchLocale(workLocation.end_date);

  await fillTextByLabel(page, 'Scheduled start date of the posting', start);
  await fillTextByLabel(page, 'Scheduled end date of the posting', end);

  // Next to Notifier details
  await clickNext(page);

  // SECTION 3 — Notifier details (person + company basics)
  await fillTextInTestIdInput(page, 'P785_NatuurlijkPersoon-Voornaam_1', requireEnv('NOTIFIER_FIRST_NAME'));
  await fillTextInTestIdInput(page, 'P785_NatuurlijkPersoon-Achternaam_1', requireEnv('NOTIFIER_LAST_NAME'));

  // Only Mobile phone number is required
  await fillTextInTestIdInput(page, 'P785_NatuurlijkPersoon-Telefoonnummer_1', requireEnv('NOTIFIER_PHONE'));

  await fillTextInTestIdInput(page, 'P785_NatuurlijkPersoon-Emailadres_1', requireEnv('NOTIFIER_EMAIL'));

  // Country of establishment -> Slovakia
  await selectMatOptionByText(page, 'P785_Organisatie-LandVanVestiging_1', 'Slovakia');

  // Dutch Chamber of Commerce? -> No
  await setRadioByTestId(page, 'P785_Organisatie-InKamerVanKoophandelJaNee_1', 'false');

  // Foreign Chamber of Commerce? -> Yes
  await setRadioByTestId(page, 'P785_Organisatie-InBuitenlandseKamerJaNee_1', 'true');

  // Chamber number from env
  await fillTextInTestIdInput(page, 'P785_Organisatie-KamerVanKoophandelNr_1', requireEnv('NOTIFIER_CHAMBER_NUMBER'));

  // Company name = first + last
  const notifierCompany = `${requireEnv('NOTIFIER_FIRST_NAME')} ${requireEnv('NOTIFIER_LAST_NAME')}`;
  await fillTextInTestIdInput(page, 'P785_Organisatie-Bedrijfsnaam_1', notifierCompany);

  // VAT identification: “The company does not have a VAT identification number...”
  await setRadioByTestId(page, 'P785_Organisatie-GeenBtwIdentificatie_1', 'true');

  // Notifier address (fill full address)
  await fillTextInTestIdInput(page, 'P785_Adres-Straat_1', requireEnv('NOTIFIER_STREET'));
  await fillTextInTestIdInput(page, 'P785_Adres-Huisnummer_1', requireEnv('NOTIFIER_HOUSE_NUMBER'));
  await fillTextInTestIdInput(page, 'P785_Adres-Plaatsnaam_1', requireEnv('NOTIFIER_CITY'));
  await fillTextInTestIdInput(page, 'P785_Adres-Postcode_1', requireEnv('NOTIFIER_POSTCODE'));

  // Reporter and self-employed are the same person -> Yes
  await setRadioByTestId(page, 'P785_MelderZelfdePersoonJaNee_1', 'true');

  // Date of birth
  await fillTextInTestIdInput(page, 'P785_NatuurlijkPersoon-Geboortedatum_1', requireEnv('NOTIFIER_DATE_OF_BIRTH'));

  // Nationality -> Slovakia
  await selectMatOptionByText(page, 'P785_NatuurlijkPersoon-Nationaliteit_1', 'Slovakia');

  // Next to Service recipient section
  await clickNext(page);

  // SECTION 4 — Service recipient: type, KVK lookup, VAT, address, contact
  // Type of service recipient -> Company
  await selectMatOptionByText(page, 'P785_Dienstontvanger-Soort_1', 'Company');

  // Country of establishment -> Netherlands (EEA)
  await selectMatOptionByText(page, 'P785_Dienstontvanger-LandVanVestiging_1', 'Netherlands (EEA)');

  // KVK + Branch number → search
  await fillTextInTestIdInput(page, 'P785_Dienstontvanger-KvKNummer_1', requireEnv('SERVICE_RECIPIENT_KVK_NUMBER'));
  await fillTextInTestIdInput(page, 'P785_Dienstontvanger-Vestigingsnummer_1', requireEnv('SERVICE_RECIPIENT_BRANCH_NUMBER'));
  await clickByTestId(page, 'P785_Dienstontvanger-ZoekInHandelsregister_1');
  await waitForStableLoad(page);

  // Confirm result: click the "Select" action
  await page.getByText('Select', { exact: true }).click();
  await waitForStableLoad(page);

  // VAT number
  await fillTextInTestIdInput(page, 'P785_Dienstontvanger-VatNummer_1', requireEnv('SERVICE_RECIPIENT_VAT_NUMBER'));

  // Address selection strategy: Provide manually -> No
  await setRadioByTestId(page, 'P785_Adres-PostcodeCheckOverschrijven_1', 'false');

  // Fill postcode + house number from env
  await fillTextInTestIdInput(page, 'P785_Adres-PostcodeNederland_1', requireEnv('SERVICE_RECIPIENT_POSTCODE'));
  await fillTextInTestIdInput(page, 'P785_Adres-Huisnummer_1', requireEnv('SERVICE_RECIPIENT_HOUSE_NUMBER'));

  // Contact info
  await fillTextInTestIdInput(page, 'P785_CP_Voornaam_1', requireEnv('SERVICE_RECIPIENT_CONTACT_FIRST_NAME'));
  await fillTextInTestIdInput(page, 'P785_CP_Achternaam_1', requireEnv('SERVICE_RECIPIENT_CONTACT_LAST_NAME'));
  await fillTextInTestIdInput(page, 'P785_CP_Telefoonnummer_1', requireEnv('SERVICE_RECIPIENT_PHONE'));
  await fillTextInTestIdInput(page, 'P785_CP_Emailadres_1', requireEnv('SERVICE_RECIPIENT_EMAIL'));

  // Next to Work location section
  await clickNext(page);

  // SECTION 5 — Address/place where work will be performed
  // Does the workplace in NL have a known address? -> Yes
  await setRadioByTestId(page, 'P903_Werklocatie-BekendAdresJaNee_1', 'true');

  // Provide manually -> No
  await setRadioByTestId(page, 'P903_Adres-PostcodeCheckOverschrijven_1', 'false');

  // Derive postcode from PDOK using JSON street/city/houseNumber, then fill
  const wlStreet = workLocation.street;
  const wlCity = workLocation.city;
  const wlHouse = workLocation.house_number;
  const derivedPostcode = await pdokLookupPostalCode(page, wlStreet, wlHouse, wlCity);

  await fillTextInTestIdInput(page, 'P903_Adres-PostcodeNederland_1', derivedPostcode);
  await fillTextInTestIdInput(page, 'P903_Adres-Huisnummer_1', wlHouse);

  // Work-location contact: phone + email from service recipient (env)
  await fillTextInTestIdInput(page, 'P903_Werklocatie-ContactTelefoonnummer_1', requireEnv('SERVICE_RECIPIENT_PHONE'));
  await fillTextInTestIdInput(page, 'P903_Werklocatie-ContactEmailadres_1', requireEnv('SERVICE_RECIPIENT_EMAIL'));

  // A1 coverage section
  await setRadioByTestId(page, 'P903_Werknemer-A1VerklaringAanwezig_1', 'true');
  await selectMatOptionByText(page, 'P903_Werknemer-A1VerklaringLandIsoUitgifte_1', 'Slovakia (EEA)');

  // Go to summary
  await clickNext(page, 'Go to summary');

  // SECTION 6 — Summary: confirm declaration and submit
  await page.getByTestId('P437_Melder-Akkoordverklaring_1').locator('input[type="checkbox"]').check();
  // await clickByTestId(page, 'P437_Indienen_1');

  // Logout
  await waitForStableLoad(page);
  await page.getByText('Logout', { exact: false }).click();
  await waitForStableLoad(page);
});
