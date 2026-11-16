import { expect, test } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { ACCOUNTS_KEY, ACCOUNTS_PORT, SERVER_PORT } from '../playwright.config';

/** A 1x1 picture, served for every player's "Google picture". */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * A player in a browser of their own, pointed at the game server and at the stand-in for
 * Supabase that the tests started (e2e/fake-supabase.mjs). There a trip to "Google" needs
 * no password: it comes straight back as a new player.
 */
async function player(browser: Browser, contextOptions: Parameters<Browser['newContext']>[0]) {
  const context = await browser.newContext(contextOptions);
  await context.addInitScript(
    ({ server, accounts }) => {
      Object.assign(window, { __GUR_SERVER__: server, __GUR_ACCOUNTS__: accounts });
    },
    {
      server: `http://localhost:${SERVER_PORT}`,
      accounts: { url: `http://localhost:${ACCOUNTS_PORT}`, key: ACCOUNTS_KEY },
    },
  );
  await context.route('https://pictures.test/**', (route) => route.fulfill({ contentType: 'image/png', body: PIXEL }));
  const page = await context.newPage();
  await page.goto('/');
  return page;
}

test('a player signs in, renames themselves, and plays under that name with their picture', async ({
  browser,
}, testInfo) => {
  const options = testInfo.project.use;
  const ana = await player(browser, options);

  // to "Google" and back: the card shows who she is, and the address is clean again
  await ana.getByRole('button', { name: 'Sign in with Google' }).click();
  await expect(ana.getByTestId('account-name')).toHaveText(/^Ana\d{4}$/);
  await expect(ana.getByTestId('account-id')).toHaveText(/^ID \d{8}$/);
  await expect.poll(() => new URL(ana.url()).search).toBe('');

  // a name somebody has is refused, in words; a free one is hers
  await ana.getByRole('button', { name: 'Change name' }).click();
  await ana.getByLabel('New name').fill('taken');
  await ana.getByRole('button', { name: 'Save' }).click();
  await expect(ana.getByTestId('account-error')).toHaveText('Somebody already has that name');
  const name = `Ana_${Date.now() % 100000}_${testInfo.workerIndex}`;
  await ana.getByLabel('New name').fill(name);
  await ana.getByRole('button', { name: 'Save' }).click();
  await expect(ana.getByTestId('account-name')).toHaveText(name);

  // still signed in after closing and opening the page
  await ana.reload();
  await expect(ana.getByTestId('account-name')).toHaveText(name);
  await testInfo.attach('account-card', { body: await ana.screenshot(), contentType: 'image/png' });

  // with friends she plays under that name: there is nothing to type
  await ana.getByRole('button', { name: 'Play with friends' }).click();
  await expect(ana.getByTestId('playing-as')).toHaveText(name);
  await expect(ana.getByLabel('Your name')).toHaveCount(0);
  await ana.getByRole('button', { name: 'Create a lobby' }).click();
  const code = (await ana.getByTestId('lobby-code').textContent())!;

  // Ben is a guest; he sees Ana's name and picture, as the server read them from her profile
  const ben = await player(browser, options);
  await ben.getByRole('button', { name: 'Play with friends' }).click();
  await ben.getByLabel('Your name').fill('Ben');
  await ben.getByLabel('Lobby code').fill(code);
  await ben.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(ben.getByTestId('members')).toContainText(name);
  await expect(ben.getByTestId('picture-0')).toBeVisible();
  await expect(ben.getByTestId('picture-1')).toHaveCount(0);
  await testInfo.attach('lobby-with-picture', { body: await ben.screenshot(), contentType: 'image/png' });

  // at the table too
  await ana.getByRole('button', { name: 'Start the game' }).click();
  await expect(ben.getByTestId('rack-tile').first()).toBeVisible();
  await expect(ben.getByTestId('picture-0')).toBeVisible();
  await testInfo.attach('table-with-picture', { body: await ben.screenshot(), contentType: 'image/png' });

  await ana.context().close();
  await ben.context().close();
});

test('signing out makes you a guest again', async ({ browser }, testInfo) => {
  const page = await player(browser, testInfo.project.use);
  await page.getByRole('button', { name: 'Sign in with Google' }).click();
  await expect(page.getByTestId('account-name')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  await page.getByRole('button', { name: 'Play with friends' }).click();
  await expect(page.getByLabel('Your name')).toBeVisible();
  await page.context().close();
});

test('without accounts set up, nothing about signing in is shown', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play with friends' })).toBeVisible();
  await expect(page.getByTestId('account')).toHaveCount(0);
});
