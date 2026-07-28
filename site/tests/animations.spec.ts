import { test, expect } from '@playwright/test';

test('homepage exposes deliberate motion hooks', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.hero-reveal')).toHaveCount(5);
  await expect(page.locator('.project-row')).toHaveCount(4);
  await expect(page.locator('.architecture-boot-node')).toHaveCount(3);
  await expect(page.locator('.architecture-boot-connector')).toHaveCount(2);
});

test('motion is disabled when reduced motion is requested', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const motion = await page.evaluate(() => {
    const hero = document.querySelector('.hero-reveal');
    const node = document.querySelector('.architecture-boot-node');
    return {
      heroAnimation: hero ? getComputedStyle(hero).animationName : null,
      nodeOpacity: node ? getComputedStyle(node).opacity : null,
      nodeTransform: node ? getComputedStyle(node).transform : null,
    };
  });

  expect(motion.heroAnimation).toBe('none');
  expect(motion.nodeOpacity).toBe('1');
  expect(motion.nodeTransform).toBe('none');
});

test('theme icons transition to match the active theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');

  const toggle = page.locator('[data-theme-toggle]');
  await expect(page.locator('.theme-icon-sun')).toHaveCSS('opacity', '1');
  await expect(page.locator('.theme-icon-moon')).toHaveCSS('opacity', '0');

  await toggle.click();
  await page.waitForTimeout(220);
  await expect(page.locator('.theme-icon-sun')).toHaveCSS('opacity', '0');
  await expect(page.locator('.theme-icon-moon')).toHaveCSS('opacity', '1');
});
