import { expect, type Page } from '@playwright/test';

export async function openChat(page: Page) {
  await expect(page.locator('[data-portfolio-chat]')).toHaveCount(1);

  const launcher = page.locator('[data-chat-launcher]');
  const panel = page.locator('[data-chat-panel]');
  await expect(launcher).toBeVisible();
  await launcher.click();
  await expect(panel).toBeVisible();

  return { launcher, panel };
}

