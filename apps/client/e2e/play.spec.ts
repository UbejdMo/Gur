import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

// The web build is a single-page app: open it from the home page, the way players arrive.
async function startGame(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play against bots' }).click();
}

/** Waits until it is your turn to discard (drawing from the middle if needed). Returns false if a bot closed first. */
async function readyToDiscard(page: Page): Promise<boolean> {
  const status = page.getByTestId('status');
  const results = page.getByTestId('results');
  await expect(status.filter({ hasText: /^Your turn|^Drag a tile|^You can close/ }).or(results)).toBeVisible({
    timeout: 15_000,
  });
  if (await results.isVisible()) return false;
  if ((await status.textContent())?.startsWith('Your turn')) await page.getByTestId('draw-middle').click();
  await expect(page.getByTestId('rack-tile')).toHaveCount(15);
  return true;
}

/** Drags with the mouse in small steps, like a person would. */
async function drag(page: Page, from: Locator, to: { x: number; y: number }) {
  const box = (await from.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

test('home starts a game against bots', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Gur' })).toBeVisible();
  await page.getByRole('button', { name: 'Play against bots' }).click();
  await expect(page).toHaveURL(/\/play\?aceHigh=1/);
  await expect(page.getByTestId('seat')).toHaveCount(3);
  await expect(page.getByTestId('rack-row')).toHaveCount(2);
});

test('a full turn: drag a tile up to discard it, the bots play, and it is your turn again', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await startGame(page);
  test.skip(!(await readyToDiscard(page)), 'a bot closed before your first turn');

  const tile = page.getByTestId('rack-tile').first();
  const box = (await tile.boundingBox())!;
  await drag(page, tile, { x: box.x + box.width / 2, y: box.y - 160 });
  await expect(page.getByTestId('rack-tile')).toHaveCount(14);
  await expect(page.getByTestId('last-discard')).toBeVisible();

  const status = page.getByTestId('status');
  await expect(status.filter({ hasText: /^Your turn/ }).or(page.getByTestId('results'))).toBeVisible({
    timeout: 15_000,
  });
  expect(errors).toEqual([]);
});

test('drag a tile into an empty slot', async ({ page }) => {
  await startGame(page);
  test.skip(!(await readyToDiscard(page)), 'a bot closed before your first turn');

  // The first tile sits in slot 1; drag it into the last empty slot.
  const tile = page.getByTestId('rack-tile').first();
  const target = page.getByTestId('rack-slot-empty').last();
  const targetName = (await target.getAttribute('aria-label'))!;
  const slot = (await target.boundingBox())!;
  await drag(page, tile, { x: slot.x + slot.width / 2, y: slot.y + slot.height / 2 });

  // Slot 1 is now empty and the target slot is filled. (Tile names can repeat, so check the slots.)
  await expect(page.getByRole('button', { name: 'Empty slot 1', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: targetName, exact: true })).toHaveCount(0);
  await expect(page.getByTestId('rack-tile')).toHaveCount(15);
});

test('tap a tile, then the Discard button', async ({ page }) => {
  await startGame(page);
  test.skip(!(await readyToDiscard(page)), 'a bot closed before your first turn');

  await page.getByTestId('rack-tile').nth(3).click();
  await expect(page.getByTestId('rack-tile').nth(3)).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByTestId('rack-tile')).toHaveCount(14);
});
