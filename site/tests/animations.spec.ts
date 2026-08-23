import { test, expect } from '@playwright/test';

test('homepage exposes deliberate motion hooks', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.hero-reveal')).toHaveCount(5);
  await expect(page.locator('.project-entry')).toHaveCount(4);
  await expect(page.locator('.system-diagram-strip')).toHaveCount(4);
  await expect(page.locator('.project-card .system-diagram-strip')).toHaveCount(3);
  await expect(page.locator('.project-showcase .system-diagram-strip')).toHaveCount(1);
  await expect(page.locator('.architecture-boot-node')).toHaveCount(3);
  await expect(page.locator('.architecture-boot-connector')).toHaveCount(2);
});

test('live background initializes a visible, animated canvas', async ({ page }) => {
  await page.goto('/');

  const canvas = page.locator('[data-constellation]');
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toHaveAttribute('data-animation-state', 'running');

  const dimensions = await canvas.evaluate((element: HTMLCanvasElement) => ({
    cssWidth: element.getBoundingClientRect().width,
    cssHeight: element.getBoundingClientRect().height,
    bitmapWidth: element.width,
    bitmapHeight: element.height,
  }));

  expect(dimensions.cssWidth).toBeGreaterThan(0);
  expect(dimensions.cssHeight).toBeGreaterThan(0);
  expect(dimensions.bitmapWidth).toBeGreaterThanOrEqual(dimensions.cssWidth);
  expect(dimensions.bitmapHeight).toBeGreaterThanOrEqual(dimensions.cssHeight);
});

test('motion is disabled when reduced motion is requested', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  await expect(page.locator('[data-constellation]')).toHaveAttribute(
    'data-animation-state',
    'static',
  );

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

test('theme icons transition to match the selected mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');

  const toggle = page.locator('[data-theme-toggle]');
  // Fresh visit follows the system, shown by the monitor icon.
  await expect(page.locator('.theme-icon-auto')).toHaveCSS('opacity', '1');
  await expect(page.locator('.theme-icon-sun')).toHaveCSS('opacity', '0');
  await expect(page.locator('.theme-icon-moon')).toHaveCSS('opacity', '0');

  await toggle.click();
  await page.waitForTimeout(220);
  await expect(page.locator('.theme-icon-auto')).toHaveCSS('opacity', '0');
  await expect(page.locator('.theme-icon-sun')).toHaveCSS('opacity', '1');
  await expect(page.locator('.theme-icon-moon')).toHaveCSS('opacity', '0');

  await toggle.click();
  await page.waitForTimeout(220);
  await expect(page.locator('.theme-icon-sun')).toHaveCSS('opacity', '0');
  await expect(page.locator('.theme-icon-moon')).toHaveCSS('opacity', '1');
});
