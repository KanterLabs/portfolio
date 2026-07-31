import { test, expect, type Locator } from '@playwright/test';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function box(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox();
  expect(b, `expected ${locator} to have a bounding box`).not.toBeNull();
  return b!;
}

function intersects(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

// Regression guard for the light-mode bug where the absolutely-positioned
// moon icon was flex-centered over the "Theme" label instead of sitting in
// the icon slot.
test.describe('theme toggle layout', () => {
  for (const theme of ['dark', 'light'] as const) {
    test(`icon stays clear of the label in ${theme} mode`, async ({ page, isMobile }) => {
      test.skip(isMobile === true, 'the Theme label is hidden at mobile widths');

      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/');
      await page.evaluate((t) => {
        localStorage.setItem('portfolio-theme', t);
        document.documentElement.dataset.theme = t;
      }, theme);

      const toggle = page.locator('.theme-toggle').first();
      const stackBox = await box(toggle.locator('.theme-icon-stack'));
      const labelBox = await box(toggle.locator('.theme-toggle-label'));
      const toggleBox = await box(toggle);

      expect(
        intersects(stackBox, labelBox),
        `icon slot ${JSON.stringify(stackBox)} must not overlap label ${JSON.stringify(labelBox)}`
      ).toBe(false);

      // The icon slot is a fixed 16px square, left of the label, inside the button.
      expect(stackBox.width).toBeCloseTo(16, 0);
      expect(stackBox.height).toBeCloseTo(16, 0);
      expect(stackBox.x + stackBox.width).toBeLessThanOrEqual(labelBox.x);
      expect(stackBox.x).toBeGreaterThanOrEqual(toggleBox.x);
      expect(labelBox.x + labelBox.width).toBeLessThanOrEqual(toggleBox.x + toggleBox.width + 0.5);

      // The visible (untransformed) icon fills the slot exactly.
      const visibleIcon = toggle.locator(theme === 'light' ? '.theme-icon-moon' : '.theme-icon-sun');
      const visibleBox = await box(visibleIcon);
      expect(Math.abs(visibleBox.x - stackBox.x)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(visibleBox.y - stackBox.y)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(visibleBox.width - stackBox.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(visibleBox.height - stackBox.height)).toBeLessThanOrEqual(1);
    });
  }
});
