import { expect, test } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { ACCOUNTS_PORT, SERVER_PORT } from '../playwright.config';
import { signedIn } from './helpers';

/** A guest player in a browser of their own, pointed at the test game server, without accounts. */
async function guest(browser: Browser, contextOptions: Parameters<Browser['newContext']>[0]) {
  const context = await browser.newContext(contextOptions);
  await context.addInitScript((url) => {
    Object.assign(window, { __GUR_SERVER__: url, __GUR_ACCOUNTS__: null });
  }, `http://localhost:${SERVER_PORT}`);
  const page = await context.newPage();
  await page.goto('/');
  return page;
}

test('players chat in the waiting room and at the table: one tap sends an emoji, which pops up over the seat', async ({
  browser,
}, testInfo) => {
  const ana = await guest(browser, testInfo.project.use);
  const ben = await guest(browser, testInfo.project.use);

  await ana.getByRole('button', { name: 'Play with friends' }).click();
  await ana.getByLabel('Your name').fill('Ana');
  await ana.getByRole('button', { name: 'Create a lobby' }).click();
  const code = (await ana.getByTestId('lobby-code').textContent())!;
  await ben.getByRole('button', { name: 'Play with friends' }).click();
  await ben.getByLabel('Your name').fill('Ben');
  await ben.getByRole('button', { name: 'Join a lobby' }).click();
  await ben.getByLabel('Lobby code').fill(code);
  await ben.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(ana.getByTestId('members')).toContainText('Ben');

  // in the waiting room, Ben says hello; Ana sees the count on her chat button
  await ben.getByRole('button', { name: 'Chat' }).click();
  await ben.getByLabel('Message to the table').fill('Hi Ana, ready?');
  await ben.getByLabel('Message to the table').press('Enter');
  await expect(ben.getByTestId('chat-mine')).toContainText('Hi Ana, ready?');
  await expect(ana.getByRole('button', { name: 'Chat, 1 unread' })).toBeVisible();
  await ana.getByRole('button', { name: 'Chat, 1 unread' }).click();
  await expect(ana.getByTestId('chat-theirs')).toContainText('Hi Ana, ready?');
  await ana.getByRole('button', { name: 'Close chat' }).click();
  await expect(ana.getByRole('button', { name: 'Chat', exact: true })).toBeVisible();
  await ben.getByRole('button', { name: 'Close chat' }).click();

  // the game starts; the chat carries on at the table
  await ana.getByRole('button', { name: 'Start the game' }).click();
  await expect(ben.getByTestId('rack-row')).toHaveCount(2);
  await ben.getByRole('button', { name: 'Chat', exact: true }).click();
  await expect(ben.getByTestId('chat-mine')).toContainText('Hi Ana, ready?');
  await testInfo.attach('chat-panel', { body: await ben.screenshot(), contentType: 'image/png' });
  // a tap on an emoji sends it at once: no keyboard, no Send
  await ben.getByRole('button', { name: 'Send 🔥' }).click();
  await ben.getByRole('button', { name: 'Close chat' }).click();

  // on Ana's table it pops up over Ben's seat, and over Ben's own seat on his
  await expect(ana.getByTestId('speech')).toHaveText('🔥');
  await expect(ana.getByTestId('seat').getByTestId('speech')).toHaveText('🔥');
  await expect(ben.getByTestId('seat-you').getByTestId('speech')).toHaveText('🔥');
  await testInfo.attach('bubble', { body: await ana.screenshot(), contentType: 'image/png' });
  // a few seconds later it is gone
  await expect(ana.getByTestId('speech')).toHaveCount(0, { timeout: 7_000 });

  // Ana mutes Ben: his next lines no longer reach her
  await ana.getByRole('button', { name: /^Chat/ }).click();
  await ana.getByRole('button', { name: 'Mute Ben' }).click();
  await expect(ana.getByTestId('chat-theirs')).toHaveCount(0);
  await ana.getByRole('button', { name: 'Close chat' }).click();
  await ben.getByRole('button', { name: 'Chat', exact: true }).click();
  await ben.getByRole('button', { name: 'Send 😂' }).click();
  await expect(ben.getByTestId('chat-mine')).toHaveCount(3);
  await ben.waitForTimeout(500);
  await expect(ana.getByTestId('speech')).toHaveCount(0);
  await expect(ana.getByTestId('chat-unread')).toHaveCount(0);
  // guests can mute, but not report
  await expect(ana.getByRole('button', { name: 'Report Ben' })).toHaveCount(0);

  await ana.context().close();
  await ben.context().close();
});

test('a signed-in player reports another from the table chat', async ({ browser, request }, testInfo) => {
  const ana = await signedIn(browser, testInfo.project.use);
  const ben = await signedIn(browser, testInfo.project.use);

  await ana.page.getByRole('button', { name: 'Play with friends' }).click();
  await ana.page.getByRole('button', { name: 'Create a lobby' }).click();
  const code = (await ana.page.getByTestId('lobby-code').textContent())!;
  await ben.page.getByRole('button', { name: 'Play with friends' }).click();
  await ben.page.getByRole('button', { name: 'Join a lobby' }).click();
  await ben.page.getByLabel('Lobby code').fill(code);
  await ben.page.getByRole('button', { name: 'Join', exact: true }).click();
  await ben.page.getByRole('button', { name: 'Chat' }).click();
  await ben.page.getByLabel('Message to the table').fill('you will lose, loser');
  await ben.page.getByRole('button', { name: 'Send', exact: true }).click();

  await ana.page.getByRole('button', { name: /^Chat/ }).click();
  await ana.page.getByRole('button', { name: `Report ${ben.name}` }).click();
  await ana.page.getByRole('radio', { name: 'Bullying or harassment' }).click();
  await testInfo.attach('report', { body: await ana.page.screenshot(), contentType: 'image/png' });
  await ana.page.getByRole('button', { name: 'Send report' }).click();
  await expect(ana.page.getByTestId('chat-notice')).toContainText('muted for you');
  await expect(ana.page.getByRole('button', { name: `Unmute ${ben.name}` })).toBeVisible();

  const reports = (await (await request.get(`http://localhost:${ACCOUNTS_PORT}/test/reports`)).json()) as {
    reason: string;
    table_chat?: string[];
  }[];
  expect(reports).toContainEqual(
    expect.objectContaining({ reason: 'harassment', table_chat: ['you will lose, loser'] }),
  );

  await ana.page.context().close();
  await ben.page.context().close();
});
