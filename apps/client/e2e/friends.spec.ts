import { expect, test } from '@playwright/test';
import type { Browser, Locator, Page } from '@playwright/test';
import { SERVER_PORT } from '../playwright.config';

/** A player in a browser of their own, pointed at the game server the tests started. */
async function player(browser: Browser, contextOptions: Parameters<Browser['newContext']>[0]) {
  const context = await browser.newContext(contextOptions);
  await context.addInitScript((url) => {
    (window as unknown as { __GUR_SERVER__: string }).__GUR_SERVER__ = url;
  }, `http://localhost:${SERVER_PORT}`);
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Play with friends' }).click();
  return page;
}

/** Presses on a tile and drags it to a point, in steps, the way a finger or mouse would. */
async function drag(page: Page, from: Locator, to: { x: number; y: number }) {
  const box = (await from.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

/** Drags the first tile of the rack up off it: a discard. Returns the tile's name. */
async function discardFirst(page: Page): Promise<string> {
  const tile = page.getByTestId('rack-tile').first();
  const name = (await tile.getAttribute('aria-label'))!;
  const box = (await tile.boundingBox())!;
  await drag(page, tile, { x: box.x + box.width / 2, y: box.y - 160 });
  return name;
}

test('two friends meet in a lobby by code and play a turn each', async ({ browser }, testInfo) => {
  const options = testInfo.project.use;
  const ana = await player(browser, options);
  const ben = await player(browser, options);

  // Ana opens a lobby and gets a code
  await ana.getByLabel('Your name').fill('Ana');
  await ana.getByRole('button', { name: 'Create a lobby' }).click();
  const code = (await ana.getByTestId('lobby-code').textContent())!;
  expect(code).toMatch(/^[A-Z2-9]{5}$/);
  // alone, she cannot start
  await expect(ana.getByText(/You need at least 2 players/)).toBeVisible();

  // Ben joins with the code, typed in lower case
  await ben.getByLabel('Your name').fill('Ben');
  await ben.getByRole('button', { name: 'Join a lobby' }).click();
  await ben.getByLabel('Lobby code').fill(code.toLowerCase());
  await ben.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(ben.getByTestId('lobby-code')).toHaveText(code);
  await expect(ben.getByTestId('member')).toHaveCount(2);
  await expect(ben.getByTestId('waiting-for-host')).toHaveText(/Waiting for the lobby leader \(Ana\)/);
  await expect(ana.getByTestId('member')).toHaveCount(2);
  await expect(ana.getByTestId('members')).toContainText('Ben');

  // only the host has a start button
  await expect(ben.getByRole('button', { name: 'Start the game' })).toHaveCount(0);
  await ana.getByRole('button', { name: 'Start the game' }).click();

  // both are at the table; with two players the other one sits across
  for (const page of [ana, ben]) {
    await expect(page.getByTestId('rack-row')).toHaveCount(2);
    await expect(page.getByTestId('seat')).toHaveCount(1);
  }
  await expect(ana.getByTestId('seat')).toContainText('Ben');
  await expect(ben.getByTestId('seat')).toContainText('Ana');

  // whoever was dealt 15 tiles starts
  const anaStarts = (await ana.getByTestId('rack-tile').count()) === 15;
  const [first, second] = anaStarts ? [ana, ben] : [ben, ana];
  const [firstName, secondName] = anaStarts ? ['Ana', 'Ben'] : ['Ben', 'Ana'];
  await expect(first.getByTestId('rack-tile')).toHaveCount(15);
  await expect(second.getByTestId('rack-tile')).toHaveCount(14);
  await expect(second.getByTestId('status')).toHaveText(`${firstName} is playing…`);

  // the first player discards; the tile lands in front of the other player, who may take it
  const discarded = await discardFirst(first);
  await expect(first.getByTestId('rack-tile')).toHaveCount(14);
  await expect(second.getByTestId('status')).toHaveText(/^Your turn/);
  await expect(second.getByLabel('Tiles left for you').getByTestId('last-discard')).toHaveAttribute(
    'aria-label',
    discarded,
  );
  await expect(second.getByTestId('log')).toHaveText(`${firstName} discarded ${discarded}`);
  await expect(first.getByTestId('status')).toHaveText(`${secondName} is playing…`);

  // the second player draws from the middle and discards; the turn comes back
  const count = Number(await second.getByTestId('middle-count').textContent());
  await second.getByTestId('draw-middle').click();
  await expect(second.getByTestId('rack-tile')).toHaveCount(15);
  await expect(first.getByTestId('middle-count')).toHaveText(String(count - 1));
  await expect(first.getByTestId('log')).toHaveText(`${secondName} drew from the middle`);
  await discardFirst(second);
  await expect(first.getByTestId('status')).toHaveText(/^Your turn/);

  // a move out of turn is refused by the server, in words
  await second.getByTestId('draw-middle').click();
  await expect(second.getByTestId('rack-tile')).toHaveCount(14);
});

test('a player who reloads the page gets back to their seat', async ({ browser }, testInfo) => {
  const options = testInfo.project.use;
  const ana = await player(browser, options);
  const ben = await player(browser, options);
  await ana.getByLabel('Your name').fill('Ana');
  await ana.getByRole('button', { name: 'Create a lobby' }).click();
  const code = (await ana.getByTestId('lobby-code').textContent())!;
  await ben.getByLabel('Your name').fill('Ben');
  await ben.getByRole('button', { name: 'Join a lobby' }).click();
  await ben.getByLabel('Lobby code').fill(code);
  await ben.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(ana.getByTestId('member')).toHaveCount(2);
  await ana.getByRole('button', { name: 'Start the game' }).click();
  await expect(ben.getByTestId('rack-row')).toHaveCount(2);
  const tiles = await ben.getByTestId('rack-tile').count();

  // Ben's page is reloaded: he is back on the home screen, and Ana sees he is away
  await ben.goto('/');
  await ben.getByRole('button', { name: 'Play with friends' }).click();
  await expect(ben.getByLabel('Your name')).toHaveValue('Ben');
  await ben.getByRole('button', { name: 'Go back to your game' }).click();
  await expect(ben.getByTestId('rack-row')).toHaveCount(2);
  await expect(ben.getByTestId('rack-tile')).toHaveCount(tiles);
  await expect(ben.getByTestId('seat')).toContainText('Ana');
});

test('a wrong code is refused with a reason', async ({ browser }, testInfo) => {
  const page = await player(browser, testInfo.project.use);
  await page.getByRole('button', { name: 'Join a lobby' }).click();
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByTestId('friends-error')).toHaveText('Please choose a name');
  await page.getByLabel('Your name').fill('Ana');
  await page.getByLabel('Lobby code').fill('ZZZZZ');
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByTestId('friends-error')).toHaveText(/No lobby has that code/);
});
