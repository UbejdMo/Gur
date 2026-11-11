import { expect, test } from '@playwright/test';

test('the home screen shows a practice hand and deals again', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Gur' })).toBeVisible();
  await expect(page.getByTestId('tile')).toHaveCount(16);
  await expect(page.getByTestId('middle-count')).toHaveText('48');

  const before = await page.getByTestId('tile').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  await page.getByRole('button', { name: 'Deal again' }).click();
  await expect
    .poll(async () => page.getByTestId('tile').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label'))))
    .not.toEqual(before);

  expect(errors).toEqual([]);
});
