import { AxeBuilder } from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

const themedRoutes = [
  '/',
  '/projects/kanterlabs-homelab',
  '/this-page-does-not-exist',
] as const;

for (const theme of ['light', 'dark'] as const) {
  for (const route of themedRoutes) {
    test(`axe ${theme} ${route}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.addInitScript(() => localStorage.clear());
      await page.goto(route);
      await page.evaluate(() => {
        document.querySelectorAll('.observe-animate').forEach((section) => {
          section.classList.add('visible');
        });
      });
      await page.waitForTimeout(700);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();

      expect(results.violations, results.violations.map((violation) => `${violation.id}: ${violation.help}`).join('\n'))
        .toEqual([]);
    });
  }
}

test('Greenlit remains dark and has no portfolio theme control', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/greenlit');

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('[data-theme-toggle]')).toHaveCount(0);
});

test('theme controls are keyboard accessible and meet touch size', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  const themeToggle = page.locator('[data-theme-toggle]');
  const menuToggle = page.getByRole('button', { name: 'Toggle navigation' });

  const controls = [themeToggle];
  if (await menuToggle.isVisible()) controls.push(menuToggle);

  for (const control of controls) {
    const box = await control.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await control.focus();
    await expect(control).toBeFocused();
  }

  await themeToggle.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('homepage reflows at 320px without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');

  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});
