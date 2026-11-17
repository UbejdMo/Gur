import { expect, test } from '@playwright/test';
import { becomeFriends, signedIn } from './helpers';

test('the lobby leader invites a friend, who gets the invite wherever they are in the app and joins', async ({
  browser,
}, testInfo) => {
  const ana = await signedIn(browser, testInfo.project.use);
  const ben = await signedIn(browser, testInfo.project.use);
  await becomeFriends(ana, ben);

  // Ben is busy with a game against the bots
  await ben.page.getByRole('button', { name: 'Play against bots' }).click();
  await ben.page.getByRole('button', { name: 'Start the game' }).click();
  await expect(ben.page.getByTestId('rack-row')).toHaveCount(2);

  // Ana opens a lobby and invites him
  await ana.page.getByRole('button', { name: 'Play with friends' }).click();
  await ana.page.getByRole('button', { name: 'Create a lobby' }).click();
  const code = (await ana.page.getByTestId('lobby-code').textContent())!;
  await expect(ana.page.getByTestId('invite-friends')).toContainText(ben.name);
  await ana.page.getByRole('button', { name: `Invite ${ben.name}` }).click();
  await expect(ana.page.getByTestId(`invite-${ben.name}`)).toContainText(/Invited · \d+s/);
  await testInfo.attach('leader', { body: await ana.page.screenshot(), contentType: 'image/png' });

  // it pops up over his game, with the seconds running down
  const invite = ben.page.getByTestId('invite');
  await expect(invite).toContainText(`${ana.name} invites you to play`);
  await expect(ben.page.getByTestId('invite-seconds')).toContainText(`Lobby ${code}`);
  await testInfo.attach('invited', { body: await ben.page.screenshot(), contentType: 'image/png' });
  await ben.page.getByRole('button', { name: `Join ${ana.name}` }).click();

  // he is in her lobby: he sees the code and the players, and waits for her; no options for him
  await expect(ben.page.getByTestId('lobby-code')).toHaveText(code);
  await expect(ben.page.getByTestId('members')).toContainText(ana.name);
  await expect(ben.page.getByTestId('waiting-for-host')).toContainText(`lobby leader (${ana.name})`);
  await expect(ben.page.getByRole('switch', { name: 'Allow 12-13-1' })).toHaveCount(0);
  await expect(ben.page.getByTestId('invite-friends')).toHaveCount(0);
  await testInfo.attach('member', { body: await ben.page.screenshot(), contentType: 'image/png' });

  // Ana sees him arrive; he drops off her invite list
  await expect(ana.page.getByTestId('members')).toContainText(ben.name);
  await expect(ana.page.getByTestId('invite-friends')).toContainText('All your friends are here');

  // in the game, Ben can leave; the game goes on for Ana
  await ana.page.getByRole('button', { name: 'Start the game' }).click();
  await expect(ben.page.getByTestId('rack-row')).toHaveCount(2);
  await ben.page.getByRole('button', { name: 'Leave the game' }).click();
  await expect(ben.page.getByTestId('leave-confirm')).toContainText('your turns are played for you');
  await ben.page.getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(ben.page.getByRole('heading', { name: 'Gur' })).toBeVisible();
  await expect(ana.page.getByTestId('rack-row')).toHaveCount(2);

  await ana.page.context().close();
  await ben.page.context().close();
});

test('an invite that is not answered runs out, and can then be sent again', async ({ browser }, testInfo) => {
  test.slow();
  const ana = await signedIn(browser, testInfo.project.use);
  const ben = await signedIn(browser, testInfo.project.use);
  await becomeFriends(ana, ben);

  await ana.page.getByRole('button', { name: 'Play with friends' }).click();
  await ana.page.getByRole('button', { name: 'Create a lobby' }).click();
  await ana.page.getByRole('button', { name: `Invite ${ben.name}` }).click();
  await expect(ben.page.getByTestId('invite')).toBeVisible();
  // after ten seconds it is gone for Ben, and Ana can invite him again
  await expect(ben.page.getByTestId('invite')).toHaveCount(0, { timeout: 12_000 });
  await expect(ana.page.getByRole('button', { name: `Invite ${ben.name}` })).toHaveText('Invite again');
  await ana.page.getByRole('button', { name: `Invite ${ben.name}` }).click();
  await expect(ben.page.getByTestId('invite')).toBeVisible();
  await ben.page.getByRole('button', { name: 'Not now' }).click();
  await expect(ben.page.getByTestId('invite')).toHaveCount(0);

  await ana.page.context().close();
  await ben.page.context().close();
});

test('a friend who does not have the game open cannot be invited, and the leader is told so', async ({
  browser,
}, testInfo) => {
  const ana = await signedIn(browser, testInfo.project.use);
  const ben = await signedIn(browser, testInfo.project.use);
  await becomeFriends(ana, ben);
  await ben.page.context().close();

  await ana.page.getByRole('button', { name: 'Play with friends' }).click();
  await ana.page.getByRole('button', { name: 'Create a lobby' }).click();
  await ana.page.getByRole('button', { name: `Invite ${ben.name}` }).click();
  await expect(ana.page.getByTestId('invite-error')).toHaveText('Your friend does not have the game open right now');
  await ana.page.context().close();
});
