import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// The web build is a single-page app: open it from the home page, the way players arrive.
async function startGame(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play against bots' }).click();
}

test('home starts a game against bots', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Gur' })).toBeVisible();
  await page.getByRole('button', { name: 'Play against bots' }).click();
  await expect(page).toHaveURL(/\/play\?aceHigh=1/);
  await expect(page.getByTestId('seat')).toHaveCount(3);
});

test('a full turn: draw, discard, bots play, and it is your turn again', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await startGame(page);

  const status = page.getByTestId('status');
  const results = page.getByTestId('results');
  // A bot may start; wait until it is your turn (or a bot closed straight away).
  await expect(status.filter({ hasText: /^Your turn|^Pick the tile/ }).or(results)).toBeVisible({ timeout: 15_000 });
  test.skip(await results.isVisible(), 'a bot closed before your first turn');

  if ((await status.textContent())?.startsWith('Your turn')) {
    await page.getByTestId('draw-middle').click();
  }
  await expect(page.getByTestId('rack-tile')).toHaveCount(15);

  // Pick a tile and discard it.
  await page.getByTestId('rack-tile').first().click();
  await expect(page.getByTestId('rack-tile').first()).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByTestId('rack-tile')).toHaveCount(14);

  // The three bots play, then it is your turn again (unless one of them closed).
  await expect(status.filter({ hasText: /^Your turn/ }).or(results)).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('moving a tile into a new group', async ({ page }) => {
  await startGame(page);
  const results = page.getByTestId('results');
  await expect(page.getByTestId('rack-tile').first().or(results)).toBeVisible({ timeout: 15_000 });
  test.skip(await results.isVisible(), 'a bot closed before your first turn');

  const groupsBefore = await page.locator('[data-testid="rack-group"], [data-testid="rack-meld"]').count();
  await page.getByTestId('rack-tile').first().click();
  await page.getByRole('button', { name: 'New group' }).click();
  // Dealt tiles start as one row; the first tile leaves it and starts a group of its own.
  await expect(page.locator('[data-testid="rack-group"], [data-testid="rack-meld"]')).toHaveCount(groupsBefore + 1);
  await expect(page.locator('[aria-selected="true"]')).toHaveCount(0);
});
