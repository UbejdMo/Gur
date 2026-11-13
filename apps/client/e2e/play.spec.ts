import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

// The web build is a single-page app: open it from the home page, the way players arrive.
// Bots normally take up to 10 seconds a turn; the tests switch that off.
async function startGame(page: Page) {
  await page.goto('/');
  await page.getByRole('switch', { name: 'Bots take their time' }).click();
  await page.getByRole('button', { name: 'Play against bots' }).click();
  await expect(page).toHaveURL(/bots=fast/);
}

/** Plays your discard and waits for the bots, until it is your turn to draw. Returns false if the round ended. */
async function nextDraw(page: Page): Promise<boolean> {
  const tile = page.getByTestId('rack-tile').first();
  const box = (await tile.boundingBox())!;
  await drag(page, tile, { x: box.x + box.width / 2, y: box.y - 160 });
  const status = page.getByTestId('status');
  const results = page.getByTestId('results');
  await expect(status.filter({ hasText: /^Your turn/ }).or(results)).toBeVisible({ timeout: 15_000 });
  return !(await results.isVisible());
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

test('can be added to a home screen, where it opens full screen', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = (await (await request.get(new URL(href!, page.url()).toString())).json()) as {
    display: string;
    icons: { src: string }[];
  };
  expect(manifest.display).toBe('fullscreen');
  for (const icon of manifest.icons) {
    expect((await request.get(new URL(icon.src, new URL(href!, page.url())).toString())).ok()).toBe(true);
  }
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
});

test('offers full screen where the browser can do it', async ({ page }) => {
  await page.goto('/');
  const supported = await page.evaluate(() => document.fullscreenEnabled);
  test.skip(!supported, 'this browser cannot go full screen');
  await expect(page.getByRole('button', { name: 'Full screen' })).toBeVisible();
  await page.getByRole('button', { name: 'Play against bots' }).click();
  const view = page.viewportSize()!;
  // on the sideways table it sits in the corner of the felt
  test.skip(view.width < view.height, 'only the sideways table has the corner button');
  // (the home screen stays underneath, hidden, with a button of its own)
  await expect(page.getByTestId('fullscreen').filter({ visible: true })).toHaveCount(1);
});

test('the table fits the screen: nothing is cut off and nothing scrolls', async ({ page }) => {
  await startGame(page);
  const view = page.viewportSize()!;
  const size = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
  expect(size.width).toBeLessThanOrEqual(view.width);
  expect(size.height).toBeLessThanOrEqual(view.height);
  for (const id of ['felt', 'rack', 'seat-you', 'status', 'joker-tile']) {
    const box = (await page.getByTestId(id).boundingBox())!;
    expect(box.x, id).toBeGreaterThanOrEqual(0);
    expect(box.y, id).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, id).toBeLessThanOrEqual(view.width);
    expect(box.y + box.height, id).toBeLessThanOrEqual(view.height);
  }
  // every player's row of tiles lies inside the felt
  const felt = (await page.getByTestId('felt').boundingBox())!;
  for (const row of await page.getByTestId('discards').all()) {
    const box = (await row.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(felt.x);
    expect(box.y).toBeGreaterThanOrEqual(felt.y);
    expect(box.x + box.width).toBeLessThanOrEqual(felt.x + felt.width);
    expect(box.y + box.height).toBeLessThanOrEqual(felt.y + felt.height);
  }
});

test('the whole rack is usable: slots reach from one end to the other', async ({ page }) => {
  await startGame(page);
  const rack = (await page.getByTestId('rack').boundingBox())!;
  const slots = page
    .getByTestId('rack-row')
    .first()
    .locator('[data-testid="rack-tile"], [data-testid="rack-slot-empty"]');
  const first = (await slots.first().boundingBox())!;
  const lastSlot = (await slots.last().boundingBox())!;
  expect(first.x - rack.x).toBeLessThan(first.width);
  expect(rack.x + rack.width - (lastSlot.x + lastSlot.width)).toBeLessThan(first.width);
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

test('a tile dropped on another slides in beside it', async ({ page }) => {
  await startGame(page);
  test.skip(!(await readyToDiscard(page)), 'a bot closed before your first turn');

  // The top row starts with seven tiles side by side. Drop the last tile of the bottom row on
  // the left half of the second tile: it lands between the first two, and nothing is swapped away.
  const top = page.getByTestId('rack-row').nth(0).getByTestId('rack-tile');
  const bottom = page.getByTestId('rack-row').nth(1).getByTestId('rack-tile');
  const label = async (tile: Locator) => (await tile.getAttribute('aria-label'))!;
  const [first, second, moved] = [await label(top.nth(0)), await label(top.nth(1)), await label(bottom.nth(6))];
  const topCount = await top.count();
  const target = (await top.nth(1).boundingBox())!;
  await drag(page, bottom.nth(6), { x: target.x + target.width * 0.25, y: target.y + target.height / 2 });

  await expect(top).toHaveCount(topCount + 1);
  await expect(top.nth(0)).toHaveAttribute('aria-label', first);
  await expect(top.nth(1)).toHaveAttribute('aria-label', moved);
  await expect(top.nth(2)).toHaveAttribute('aria-label', second);
  await expect(bottom).toHaveCount(6);

  // Reorder inside the group: the first tile dropped on the right half of the third goes after it,
  // and letting go doesn't leave the tile selected.
  const third = (await top.nth(2).boundingBox())!;
  await drag(page, top.nth(0), { x: third.x + third.width * 0.75, y: third.y + third.height / 2 });
  await expect(top.nth(0)).toHaveAttribute('aria-label', moved);
  await expect(top.nth(1)).toHaveAttribute('aria-label', second);
  await expect(top.nth(2)).toHaveAttribute('aria-label', first);
  await expect(page.locator('[data-testid="rack-tile"][aria-selected="true"]')).toHaveCount(0);
});

test('discards stay on the table, and the last one can be dragged onto the rack', async ({ page }) => {
  await startGame(page);
  test.skip(!(await readyToDiscard(page)), 'a bot closed before your first turn');
  test.skip(!(await nextDraw(page)), 'the round ended before your second turn');

  // In front of every player lie the tiles left for them. The tile you discarded lies in front
  // of Bot 1 (unless Bot 1 picked it up), and the one you may take lies in front of you.
  await expect(page.getByTestId('discards')).toHaveCount(4);
  expect(await page.getByLabel('Tiles left for Bot 1').getByRole('img').count()).toBeLessThanOrEqual(1);
  await expect(page.getByLabel('Tiles left for you').getByTestId('last-discard')).toHaveCount(1);

  // Drag the newest one into the last empty slot of the rack.
  const last = page.getByTestId('last-discard');
  const name = (await last.getAttribute('aria-label'))!;
  const target = page.getByTestId('rack-slot-empty').last();
  const targetName = (await target.getAttribute('aria-label'))!;
  const slot = (await target.boundingBox())!;
  await drag(page, last, { x: slot.x + slot.width / 2, y: slot.y + slot.height / 2 });

  await expect(page.getByTestId('rack-tile')).toHaveCount(15);
  await expect(page.getByRole('button', { name: targetName, exact: true })).toHaveCount(0);
  await expect(page.getByTestId('rack-row').nth(1).getByTestId('rack-tile').last()).toHaveAttribute('aria-label', name);
  await expect(page.getByTestId('last-discard')).toHaveCount(0);
});

test('tap a tile, then the Discard button', async ({ page }) => {
  await startGame(page);
  test.skip(!(await readyToDiscard(page)), 'a bot closed before your first turn');

  await page.getByTestId('rack-tile').nth(3).click();
  await expect(page.getByTestId('rack-tile').nth(3)).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByTestId('rack-tile')).toHaveCount(14);
});
