import { expect, test } from '@playwright/test';

// The privacy policy and the terms are plain pages next to the game (public/*.html):
// they must open by their own address, without the game's code, and be linked from its first screen.

test('the first screen says what Gur is and links to the privacy policy and the terms', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/free tile rummy game for 2 to 4 players/)).toBeVisible();

  await page.getByRole('link', { name: 'Privacy policy' }).click();
  await expect(page).toHaveURL(/\/privacy(\.html)?$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible();

  // and back to the game
  await page.getByRole('link', { name: '← Gur' }).click();
  await expect(page.getByRole('button', { name: 'Play with friends' })).toBeVisible();

  await page.getByRole('link', { name: 'Terms of service' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Terms of service' })).toBeVisible();
  await page.getByRole('link', { name: 'Privacy policy' }).last().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible();
});

test('the two pages answer by their own address and say what they must', async ({ page, request }) => {
  for (const address of ['/privacy.html', '/terms.html']) {
    const answer = await request.get(address);
    expect(answer.status(), address).toBe(200);
    // plain pages: the words are in the page itself, not put there by a script
    expect(await answer.text()).not.toContain('<script');
  }

  await page.goto('/privacy.html');
  for (const heading of ['What Gur keeps', 'What other players can see', 'Who stores it', 'Your choices', 'Contact']) {
    await expect(page.getByRole('heading', { name: new RegExp(heading) })).toBeVisible();
  }
  await expect(page.getByText(/not used for\s+advertising/)).toBeVisible();
  await expect(page.locator('a[href^="mailto:"]')).toBeVisible();
  // readable on a phone: nothing sticks out sideways
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.goto('/terms.html');
  await expect(page.getByText(/no real money/)).toBeVisible();
  await expect(page.locator('a[href^="mailto:"]')).toBeVisible();
});

test('without JavaScript the address still says what Gur is and where its policies are', async ({ request }) => {
  const html = await (await request.get('/')).text();
  const fallback = html.slice(html.indexOf('<noscript>'), html.indexOf('</noscript>'));
  expect(fallback).toContain('tile rummy game');
  expect(fallback).toContain('href="privacy.html"');
  expect(fallback).toContain('href="terms.html"');
});
