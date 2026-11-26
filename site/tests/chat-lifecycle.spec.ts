import { expect, test } from '@playwright/test';
import { openChat } from './helpers/chat-ui';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

test('launcher opens and closes the panel, and Escape restores launcher focus', async ({ page }) => {
  await page.goto('/');
  const { launcher, panel } = await openChat(page);
  const close = page.locator('[data-chat-close]');

  await expect(launcher).toBeHidden();
  await expect(close).toBeVisible();
  await close.click();
  await expect(panel).toBeHidden();
  await expect(launcher).toBeVisible();

  await launcher.click();
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(launcher).toBeFocused();
});

test('closing chat before the opening frame keeps focus on the launcher', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-chat-launcher]')).toBeVisible();
  const launcherKeepsFocus = await page.evaluate(async () => {
    const launcher = document.querySelector<HTMLButtonElement>('[data-chat-launcher]')!;
    launcher.click();
    if (launcher.getAttribute('aria-expanded') !== 'true') throw new Error('Chat did not open');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return document.activeElement === launcher;
  });
  expect(launcherKeepsFocus).toBe(true);
  await expect(page.locator('[data-chat-panel]')).toBeHidden();
  await expect(page.locator('[data-chat-launcher]')).toBeFocused();
});

for (const closeWith of ['Escape', 'close button'] as const) {
  test(`reopening after ${closeWith} restores a ready status and preserves the draft`, async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/chat') requests.push(request.url());
    });
    await page.goto('/');
    const { launcher, panel } = await openChat(page);
    const input = page.locator('[data-chat-input]');
    await input.fill('An unsent question');

    if (closeWith === 'Escape') await page.keyboard.press('Escape');
    else await page.locator('[data-chat-close]').click();
    await expect(panel).toBeHidden();
    await expect(launcher).toBeFocused();
    await launcher.click();

    await expect(panel).toBeVisible();
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('An unsent question');
    await expect(page.locator('[data-chat-status]')).toHaveText('Ready when you are.');
    expect(requests).toEqual([]);
  });
}
