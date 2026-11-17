import { expect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { ACCOUNTS_KEY, ACCOUNTS_PORT, SERVER_PORT } from '../playwright.config';

/**
 * A signed-in player in a browser of their own, pointed at the game server and the stand-in
 * for Supabase the tests started (e2e/fake-supabase.mjs). Returns their name and ID.
 */
export async function signedIn(browser: Browser, contextOptions: Parameters<Browser['newContext']>[0]) {
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
  await context.route('https://pictures.test/**', (route) => route.abort());
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in with Google' }).click();
  await page.getByRole('button', { name: 'Your profile' }).click();
  const name = (await page.getByTestId('account-name').textContent())!;
  const id = (await page.getByTestId('account-id').textContent())!.replace('ID ', '');
  await page.getByRole('button', { name: 'Close profile' }).click();
  return { page, name, id };
}

type Player = { page: Page; name: string; id: string };

/** `asker` sends a friend request to `other`, who accepts it. Both end on the first screen. */
export async function becomeFriends(asker: Player, other: Player) {
  await asker.page.getByRole('button', { name: 'Friends', exact: true }).click();
  await asker.page.getByLabel('Username or ID').fill(other.id);
  await asker.page.getByRole('button', { name: 'Send request' }).click();
  await expect(asker.page.getByTestId('people-message')).toHaveText(`Request sent to ${other.name}`);
  await asker.page.getByRole('button', { name: 'Close friends' }).click();

  await other.page.reload();
  await other.page.getByRole('button', { name: /^Friends, 1 request/ }).click();
  await other.page.getByRole('button', { name: `Accept ${asker.name}` }).click();
  await expect(other.page.getByTestId('friends-list')).toContainText(asker.name);
  await other.page.getByRole('button', { name: 'Close friends' }).click();
}
