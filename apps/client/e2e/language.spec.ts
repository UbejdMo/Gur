import { expect, test } from '@playwright/test';

test('an Albanian browser gets the game in Albanian; the switch changes it, and the choice is remembered', async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({ ...testInfo.project.use, locale: 'sq-AL' });
  await context.addInitScript(() => Object.assign(window, { __GUR_ACCOUNTS__: null }));
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Luaj kundër kompjuterit' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'sq');

  // a game against the computer, in Albanian
  await page.getByRole('button', { name: 'Luaj kundër kompjuterit' }).click();
  await page.getByRole('radio', { name: '1 sekondë' }).click();
  await page.getByRole('button', { name: 'Fillo lojën' }).click();
  await expect(page.getByTestId('rack-row')).toHaveCount(2);
  await expect(page.getByText('gurë në mes')).toBeVisible();
  await expect(page.getByText('XHOKER')).toBeVisible();
  await page.getByRole('button', { name: 'Dil nga loja' }).click();
  await page.getByRole('button', { name: 'Dil', exact: true }).click();

  // switch to English: it stays English after a reload
  await page.getByRole('button', { name: 'Kalo në English' }).click();
  await expect(page.getByRole('button', { name: 'Play against bots' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Play against bots' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('button', { name: 'Switch to Shqip' })).toBeVisible();
  await context.close();
});
