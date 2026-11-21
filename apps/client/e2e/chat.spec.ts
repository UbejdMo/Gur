import { expect, test } from '@playwright/test';
import { ACCOUNTS_PORT } from '../playwright.config';
import { becomeFriends, signedIn } from './helpers';

test('two friends write to each other; a message arrives at once, with an unread count', async ({
  browser,
}, testInfo) => {
  const ana = await signedIn(browser, testInfo.project.use);
  const ben = await signedIn(browser, testInfo.project.use);
  await becomeFriends(ana, ben);

  // Ana opens Ben from her friends and writes
  await ana.page.getByRole('button', { name: 'Friends', exact: true }).click();
  await ana.page.getByRole('button', { name: `Message ${ben.name}` }).click();
  await expect(ana.page.getByRole('heading', { name: ben.name })).toBeVisible();
  await expect(ana.page.getByText('No messages yet. Say hello!')).toBeVisible();
  await ana.page.getByLabel(`Message to ${ben.name}`).fill('Hi Ben! Up for a game?');
  await ana.page.getByLabel(`Message to ${ben.name}`).press('Enter');
  await expect(ana.page.getByTestId('mine')).toHaveText(/Hi Ben! Up for a game\?/);

  // Ben, on his first screen, sees the count on his messages button straight away
  await expect(ben.page.getByTestId('unread-badge')).toHaveText('1');
  await ben.page.getByRole('button', { name: 'Messages, 1 unread' }).click();
  await expect(ben.page.getByTestId(`chat-${ana.name}`)).toContainText('Hi Ben! Up for a game?');
  await testInfo.attach('conversations', { body: await ben.page.screenshot(), contentType: 'image/png' });
  await ben.page.getByTestId(`chat-${ana.name}`).click();
  await expect(ben.page.getByTestId('theirs')).toHaveText(/Up for a game/);
  await ben.page.getByLabel(`Message to ${ana.name}`).fill('Sure, invite me');
  await ben.page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(ben.page.getByTestId('unread-badge')).toHaveCount(0);

  // Ana has the conversation open: the reply appears in it, and her message shows as seen
  await expect(ana.page.getByTestId('theirs')).toHaveText(/Sure, invite me/);
  await expect(ana.page.getByText(/· Seen/)).toBeVisible();
  await testInfo.attach('conversation', { body: await ana.page.screenshot(), contentType: 'image/png' });

  await ana.page.context().close();
  await ben.page.context().close();
});

test('blocking ends the friendship and the conversation; the blocked player can be unblocked', async ({
  browser,
}, testInfo) => {
  const ana = await signedIn(browser, testInfo.project.use);
  const ben = await signedIn(browser, testInfo.project.use);
  await becomeFriends(ana, ben);

  await ben.page.getByRole('button', { name: 'Messages' }).click();
  await ben.page.getByRole('button', { name: `Write to ${ana.name}` }).click();
  await ben.page.getByLabel(`Message to ${ana.name}`).fill('hey');
  await ben.page.getByRole('button', { name: 'Send', exact: true }).click();

  // Ana blocks Ben from the conversation
  await expect(ana.page.getByTestId('unread-badge')).toHaveText('1');
  await ana.page.getByRole('button', { name: /^Messages/ }).click();
  await ana.page.getByTestId(`chat-${ben.name}`).click();
  await ana.page.getByRole('button', { name: `Block ${ben.name}` }).click();
  await expect(ana.page.getByTestId('block-confirm')).toContainText('They are not told');
  await ana.page.getByRole('button', { name: `Yes, block ${ben.name}` }).click();
  await expect(ana.page.getByTestId('messages-notice')).toContainText(`You blocked ${ben.name}`);
  await expect(ana.page.getByTestId(`chat-${ben.name}`)).toHaveCount(0);

  // Ben, still in the conversation, can no longer write to her: he is told, and the box goes
  await ben.page.getByLabel(`Message to ${ana.name}`).fill('hello?');
  await ben.page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(ben.page.getByTestId('message-error')).toHaveText('You can only write to your friends');
  await expect(ben.page.getByTestId('not-friends')).toBeVisible();
  // nor ask her to be friends again: to him she is nobody
  await ben.page.getByRole('button', { name: 'All messages' }).click();
  await ben.page.getByRole('button', { name: 'Close messages' }).click();
  await ben.page.getByRole('button', { name: 'Friends', exact: true }).click();
  await ben.page.getByLabel('Username or ID').fill(ana.id);
  await ben.page.getByRole('button', { name: 'Send request' }).click();
  await expect(ben.page.getByTestId('people-message')).toHaveText('Nobody has that name or ID');

  // Ana finds him under Blocked in her friends, and unblocks him
  await ana.page.getByRole('button', { name: 'Close messages' }).click();
  await ana.page.getByRole('button', { name: 'Friends', exact: true }).click();
  await expect(ana.page.getByTestId('blocked')).toContainText(ben.name);
  await ana.page.getByRole('button', { name: `Unblock ${ben.name}` }).click();
  await expect(ana.page.getByTestId('blocked')).toHaveCount(0);

  await ana.page.context().close();
  await ben.page.context().close();
});

test('a player reports another with a reason and a note, and blocks them at the same time', async ({
  browser,
  request,
}, testInfo) => {
  const ana = await signedIn(browser, testInfo.project.use);
  const ben = await signedIn(browser, testInfo.project.use);
  await becomeFriends(ana, ben);

  await ana.page.getByRole('button', { name: 'Friends', exact: true }).click();
  await ana.page.getByRole('button', { name: `Message ${ben.name}` }).click();
  await ana.page.getByRole('button', { name: `Report ${ben.name}` }).click();
  await ana.page.getByRole('radio', { name: 'Hate or threats' }).click();
  await ana.page.getByLabel('What happened (optional)').fill('Threatened me after the game');
  await testInfo.attach('report', { body: await ana.page.screenshot(), contentType: 'image/png' });
  await ana.page.getByRole('button', { name: 'Send report' }).click();
  await expect(ana.page.getByTestId('report-sent')).toContainText(`${ben.name} is blocked`);

  const reports = (await (await request.get(`http://localhost:${ACCOUNTS_PORT}/test/reports`)).json()) as {
    reason: string;
    details: string;
  }[];
  expect(reports).toContainEqual(expect.objectContaining({ reason: 'hate', details: 'Threatened me after the game' }));

  await ana.page.getByRole('button', { name: 'Back to all messages' }).click();
  await ana.page.getByRole('button', { name: 'Close messages' }).click();
  await ana.page.getByRole('button', { name: 'Friends', exact: true }).click();
  await expect(ana.page.getByTestId('blocked')).toContainText(ben.name);

  await ana.page.context().close();
  await ben.page.context().close();
});
