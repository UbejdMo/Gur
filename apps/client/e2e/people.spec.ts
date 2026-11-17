import { expect, test } from '@playwright/test';
import { signedIn } from './helpers';

test('two players become friends: one asks by ID, the other accepts; later one removes the other', async ({
  browser,
}, testInfo) => {
  const ana = await signedIn(browser, testInfo.project.use);
  const ben = await signedIn(browser, testInfo.project.use);

  // Ana asks Ben by his ID
  await ana.page.getByRole('button', { name: 'Friends', exact: true }).click();
  await expect(ana.page.getByTestId('friends-panel')).toBeVisible();
  await expect(ana.page.getByRole('heading', { name: 'Friends', exact: true })).toBeVisible();
  await expect(ana.page.getByTestId('friends-list')).toContainText('Nobody yet');
  await ana.page.getByLabel('Username or ID').fill('no_such_player');
  await ana.page.getByRole('button', { name: 'Send request' }).click();
  await expect(ana.page.getByTestId('people-message')).toHaveText('Nobody has that name or ID');
  await ana.page.getByLabel('Username or ID').fill(ben.id);
  await ana.page.getByRole('button', { name: 'Send request' }).click();
  await expect(ana.page.getByTestId('people-message')).toHaveText(`Request sent to ${ben.name}`);
  await expect(ana.page.getByTestId('sent')).toContainText(ben.name);

  // Ben sees the request counted on his first screen, and accepts it
  await ben.page.reload();
  await expect(ben.page.getByTestId('requests-badge')).toHaveText('1');
  await ben.page.getByRole('button', { name: /^Friends/ }).click();
  await expect(ben.page.getByTestId('requests')).toContainText(ana.name);
  await testInfo.attach('request', { body: await ben.page.screenshot(), contentType: 'image/png' });
  await ben.page.getByRole('button', { name: `Accept ${ana.name}` }).click();
  await expect(ben.page.getByTestId('friends-list')).toContainText(ana.name);
  await expect(ben.page.getByTestId('requests')).toHaveCount(0);

  // Ana has Ben as a friend now (she opens her friends again); asking again says so
  await ana.page.getByRole('button', { name: 'Close friends' }).click();
  await ana.page.getByRole('button', { name: 'Friends', exact: true }).click();
  await expect(ana.page.getByTestId('friends-list')).toContainText(ben.name);
  await expect(ana.page.getByTestId('sent')).toHaveCount(0);
  await ana.page.getByLabel('Username or ID').fill(ben.name.toLowerCase());
  await ana.page.getByRole('button', { name: 'Send request' }).click();
  await expect(ana.page.getByTestId('people-message')).toHaveText(`You and ${ben.name} are friends already`);

  // Ana removes Ben, after being asked; Ben's list is empty again
  await ana.page.getByRole('button', { name: `Remove ${ben.name}`, exact: true }).click();
  await ana.page.getByRole('button', { name: `Yes, remove ${ben.name}` }).click();
  await expect(ana.page.getByTestId('friends-list')).toContainText('Nobody yet');
  await ben.page.getByRole('button', { name: 'Close friends' }).click();
  await expect(ben.page.getByTestId('requests-badge')).toHaveCount(0);
  await ben.page.getByRole('button', { name: 'Friends', exact: true }).click();
  await expect(ben.page.getByTestId('friends-list')).toContainText('Nobody yet');

  await ana.page.context().close();
  await ben.page.context().close();
});
