import { Page, Locator, expect } from '@playwright/test';
import { waitForStableLoad } from './wait';

export async function selectMatOption(page: Page, optionText: string) {
  try {
    const option = page.getByRole('option', { name: optionText, exact: true });
    await option.waitFor({ state: 'visible', timeout: 1000 });
    await option.click({ timeout: 1000 });
    return;
  } catch {}

  try {
    const option = page.locator('mat-option', { hasText: optionText }).first();
    await option.waitFor({ state: 'visible', timeout: 1000 });
    await option.click({ timeout: 1000 });
    return;
  } catch {}

  const fallback = page.locator(`text="${optionText}"`).first();
  await fallback.waitFor({ state: 'visible', timeout: 1000 });
  await fallback.click();
}

export async function setInputValue(input: Locator, value: string) {
  await input.click({ timeout: 1000 });
  await input.fill(value);
  if ((await input.inputValue()) !== value) {
    await input.fill('');
    await input.pressSequentially(value);
  }
  await expect(input).toHaveValue(value);
  await input.press('Tab').catch(() => {});
}

export async function fillTextByLabel(page: Page, labelText: string, value: string) {
  try {
    const field = page.getByLabel(labelText, { exact: true });
    await expect(field).toBeVisible({ timeout: 1000 });
    await setInputValue(field, value);
    return;
  } catch {}

  const label = page.locator(`label:has-text("${labelText}")`).first();
  await label.waitFor({ state: 'visible', timeout: 1000 });
  const forAttr = await label.getAttribute('for');
  let input = forAttr
    ? page.locator(`#${forAttr}`)
    : label.locator('xpath=..').locator('input, textarea').first();

  await expect(input).toBeVisible({ timeout: 1000 });
  await setInputValue(input, value);
}

export async function selectMatOptionByLabel(page: Page, labelText: string, optionText: string) {
  try {
    const field = page.getByLabel(labelText, { exact: true });
    await field.click({ timeout: 1000 });
    await selectMatOption(page, optionText);
    return;
  } catch {}

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

export async function setRadioByLabel(
  page: Page,
  groupLabel: string | RegExp,
  optionText: string
) {
  try {
    const group = page.getByRole('radiogroup', { name: groupLabel });
    const option = group.getByLabel(optionText, { exact: true });
    await option.check({ timeout: 1000 });
    return;
  } catch {}

  try {
    const container = page.locator('bq-radio-button', {
      has: page.locator('label', { hasText: groupLabel }),
    });
    await container.waitFor({ state: 'visible', timeout: 1000 });
    const optionLabel = container.locator('label', { hasText: optionText }).first();
    await optionLabel.click({ timeout: 1000 });
    return;
  } catch {}

  const fallback = page.getByLabel(optionText, { exact: true });
  await expect(fallback).toBeVisible();
  await fallback.check();
}

export async function setCheckboxByLabel(
  page: Page,
  labelText: string | RegExp
) {
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

  try {
    const container = page.locator('bq-checkbox', {
      has: page.locator('label', { hasText: labelText }),
    });
    await container.waitFor({ state: 'visible', timeout: 1000 });
    const label = container.locator('label', { hasText: labelText }).first();
    await label.click({ timeout: 1000 });
    return;
  } catch {}

  const label = page.locator('label', { hasText: labelText }).first();
  await label.waitFor({ state: 'visible', timeout: 1000 });
  const forAttr = await label.getAttribute('for');
  const input = forAttr
    ? page.locator(`#${forAttr}`)
    : label.locator('input[type="checkbox"]').first();
  try {
    await input.check({ timeout: 1000 });
  } catch {
    await label.click({ timeout: 1000 });
  }
}

export async function clickProceed(page: Page, buttonText: string = 'Next') {
  let button = page.getByRole('button', { name: buttonText }).last();
  await expect(button).toBeVisible({ timeout: 10000 });
  await expect(button).toBeEnabled({ timeout: 10000 });
  await button.scrollIntoViewIfNeeded();
  try {
    await button.click({ timeout: 10000 });
  } catch {
    console.log(`Standard click on "${buttonText}" button failed, falling back to DOM click()`);
    await button.evaluate((el: HTMLElement) => el.click());
  }
  await waitForStableLoad(page);
}
