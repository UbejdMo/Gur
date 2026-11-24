import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { Browser } from '@playwright/test';

// Strangers are matched on the server, so these tests get a game server of their own (one per
// worker): players from other tests running at the same time must not sit at their tables.
// A table waits 3 seconds here instead of 30.
let server: ChildProcess | undefined;
let url = '';

test.beforeAll(async () => {
  const port = 3300 + test.info().parallelIndex;
  url = `http://localhost:${port}`;
  server = spawn('node', ['../server/dist/index.js'], {
    env: { ...process.env, PORT: String(port), MATCH_WAIT_SECONDS: '3', SUPABASE_URL: '', SUPABASE_KEY: '' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${url}/health`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('The game server for these tests did not start');
});

test.afterAll(() => {
  server?.kill();
});

/** A guest in a browser of their own, pointed at this file's game server. */
async function guest(browser: Browser, contextOptions: Parameters<Browser['newContext']>[0]) {
  const context = await browser.newContext(contextOptions);
  await context.addInitScript((address) => {
    Object.assign(window, { __GUR_SERVER__: address, __GUR_ACCOUNTS__: null });
  }, url);
  const page = await context.newPage();
  await page.goto('/');
  return page;
}

/** Opens Play online, types a name, sets 12-13-1, and looks for players. */
async function findPlayers(page: Awaited<ReturnType<typeof guest>>, name: string, aceHigh: boolean) {
  await page.getByRole('button', { name: 'Play online' }).click();
  await page.getByTestId('online-setup').getByLabel('Your name').fill(name);
  const allow = page.getByTestId('online-setup').getByRole('switch', { name: 'Allow 12-13-1' });
  if ((await allow.isChecked()) !== aceHigh) await allow.click();
  await page.getByRole('button', { name: 'Find players' }).click();
  await expect(page.getByTestId('match-status').or(page.getByTestId('rack-row').first())).toBeVisible();
}

test('players who made the same 12-13-1 choice are seated together, and the game starts with bots', async ({
  browser,
}, testInfo) => {
  const ana = await guest(browser, testInfo.project.use);
  const ben = await guest(browser, testInfo.project.use);
  const cem = await guest(browser, testInfo.project.use);

  await findPlayers(ana, 'Ana', false);
  await expect(ana.getByRole('heading', { name: 'Finding players' })).toBeVisible();
  await expect(ana.getByTestId('table-rules')).toHaveText('12-13-1 not allowed · One round');
  await findPlayers(cem, 'Cem', true);
  await findPlayers(ben, 'Ben', false);

  // Ana and Ben share a table; Cem, who wants 12-13-1, waits at another
  await expect(ana.getByTestId('member')).toHaveCount(2);
  await expect(ana.getByTestId('members')).toContainText('Ben');
  await expect(ben.getByTestId('match-status')).toContainText('Bots take the empty seats');
  await testInfo.attach('waiting', { body: await ben.screenshot(), contentType: 'image/png' });
  await expect(cem.getByTestId('member')).toHaveCount(1);

  // when the wait is over the game starts, with bots in the two empty seats
  await expect(ana.getByTestId('rack-row')).toHaveCount(2, { timeout: 10_000 });
  await expect(ben.getByTestId('rack-row')).toHaveCount(2);
  await expect(ana.getByTestId('seat')).toHaveCount(3);
  await expect(ana.getByTestId('seat').filter({ hasText: 'Ben' })).toHaveCount(1);
  await expect(ana.getByTestId('seat').filter({ hasText: /Bot \d/ })).toHaveCount(2);
  await testInfo.attach('table', { body: await ana.screenshot(), contentType: 'image/png' });

  for (const page of [ana, ben, cem]) await page.context().close();
});

test('a player alone can keep waiting, and the game starts as soon as somebody comes', async ({
  browser,
}, testInfo) => {
  const ana = await guest(browser, testInfo.project.use);
  await findPlayers(ana, 'Ana', true);
  await expect(ana.getByTestId('match-status')).toHaveText(/Looking for players/);
  await expect(ana.getByTestId('match-status')).toHaveText('Nobody else is looking right now.', { timeout: 8_000 });
  await testInfo.attach('alone', { body: await ana.screenshot(), contentType: 'image/png' });
  await ana.getByRole('button', { name: 'Keep waiting' }).click();
  await expect(ana.getByTestId('match-status')).toHaveText('Still looking. The game starts as soon as somebody comes.');

  const ben = await guest(browser, testInfo.project.use);
  await findPlayers(ben, 'Ben', true);
  await expect(ana.getByTestId('rack-row')).toHaveCount(2);
  await expect(ben.getByTestId('rack-row')).toHaveCount(2);
  await expect(ben.getByTestId('seat').filter({ hasText: 'Ana' })).toHaveCount(1);

  await ana.context().close();
  await ben.context().close();
});

test('a player alone can play against bots instead, with the same rules; or stop looking', async ({
  browser,
}, testInfo) => {
  const ana = await guest(browser, testInfo.project.use);
  await findPlayers(ana, 'Ana', false);
  await ana.getByRole('button', { name: 'Play against bots' }).click({ timeout: 8_000 });
  await expect(ana).toHaveURL(/\/play\?aceHigh=0/);
  await expect(ana.getByTestId('seat')).toHaveCount(3);

  // looking again, then giving up, goes back to the first screen
  await ana.goto('/');
  await findPlayers(ana, 'Ana', false);
  await ana.getByRole('button', { name: 'Stop looking' }).click();
  await expect(ana.getByRole('heading', { name: 'Gur' })).toBeVisible();
  // the 12-13-1 choice is remembered
  await ana.getByRole('button', { name: 'Play online' }).click();
  await expect(ana.getByTestId('online-setup').getByRole('switch', { name: 'Allow 12-13-1' })).not.toBeChecked();

  await ana.context().close();
});
