import { expect, type Page } from '@playwright/test';

// Shared fixtures for the Data Center Tycoon page specs.
export const PLAYTEST_HREF = 'mailto:shanekanterman04@gmail.com?subject=Data%20Center%20Tycoon%20playtest';
export const DISCORD_HREF = 'https://discord.gg/mqTQ5QcTfA';
export const HOSTING_ALT =
  'In-game screenshot: the Hosting panel open over the facility map, with VPS and Bare Metal sections, stat cards for subscribers, run rate and prepaid revenue, and the HUD showing cash, power, rack temperature and reputation.';
export const ACCENT = 'rgb(181, 208, 244)';
export const BORDER = 'rgb(58, 70, 86)';

export async function open(page: Page, reducedMotion: 'reduce' | 'no-preference' = 'reduce') {
  await page.emulateMedia({ reducedMotion });
  await page.goto('/datacentertycoon');
  await page.evaluate(() => document.fonts.ready);
}

export async function box(page: Page, selector: string) {
  const b = await page.locator(selector).first().boundingBox();
  expect(b, `no box for ${selector}`).not.toBeNull();
  return b!;
}

export async function expectNoOverflow(page: Page) {
  const dims = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dims.scrollWidth).toBeLessThanOrEqual(dims.clientWidth);
  const offenders = await page.evaluate(() =>
    [...document.querySelectorAll('main *')]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`),
  );
  expect(offenders).toEqual([]);
}
