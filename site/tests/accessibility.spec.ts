import { AxeBuilder } from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
import { expectPseudoElementContrast } from './helpers/contrast';
import { expectMinTargetSizes } from './helpers/touchTargets';

const themedRoutes = [
  '/',
  '/projects/multi-node-portfolio',
  '/projects/kanterlabs-homelab',
  '/projects/hostlet',
  '/projects/data-center-operations',
  '/this-page-does-not-exist',
] as const;

// wcag22aa adds target-size; best-practice adds heading-order,
// landmark-unique, region, and friends.
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(
    results.violations,
    results.violations
      .map((violation) => `${violation.id}: ${violation.help}\n  ${violation.nodes.map((n) => n.target.join(' ')).join('\n  ')}`)
      .join('\n')
  ).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  for (const route of themedRoutes) {
    test(`axe ${theme} ${route}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.addInitScript(() => localStorage.clear());
      await page.goto(route);
      await page.evaluate(() => {
        document.querySelectorAll('.observe-animate').forEach((section) => {
          section.classList.add('visible');
        });
      });
      await settle(page);

      await expectNoAxeViolations(page);
    });
  }
}

// Axe only sees what is rendered — scan the interactive widgets in their
// open states too.
test('axe with the mobile nav open', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile nav only exists at mobile widths');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await expect(page.locator('#mobile-nav')).toBeVisible();
  await settle(page);

  await expectNoAxeViolations(page);
});

test('axe with a diagram dialog open', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/projects/kanterlabs-homelab');

  await page.getByRole('button', { name: /Expand diagram:/ }).first().click();
  await expect(page.getByRole('dialog').first()).toBeVisible();
  await settle(page);

  await expectNoAxeViolations(page);
});

test('axe with the mobile TOC expanded', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the details TOC only renders below lg');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/projects/kanterlabs-homelab');

  await page.locator('[data-toc-details] summary').click();
  await expect(page.locator('[data-toc-details] nav')).toBeVisible();
  await settle(page);

  await expectNoAxeViolations(page);
});

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

// Axe cannot see text rendered by ::before/::after, so the ordered-list
// numerals and the code-block language chip need explicit contrast checks.
for (const theme of ['light', 'dark'] as const) {
  test(`pseudo-element text meets AA contrast in ${theme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/projects/hostlet');

    await expectPseudoElementContrast(page, '.prose ol li', '::before', 4.5);
    await expectPseudoElementContrast(page, '.prose pre[data-language]', '::before', 4.5);
  });
}

test.describe('theme without JavaScript', () => {
  test.use({ javaScriptEnabled: false, colorScheme: 'light' });

  test('light-preference users get the light palette', async ({ page }) => {
    await page.goto('/');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(247, 248, 246)');
  });

  test('routes that lock the theme stay dark', async ({ page }) => {
    await page.goto('/greenlit');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).not.toBe('rgb(247, 248, 246)');
  });
});

// WCAG 2.5.8: 44px targets on touch surfaces, 24px floor with a pointer.
for (const route of ['/', '/projects/kanterlabs-homelab', '/this-page-does-not-exist'] as const) {
  test(`interactive targets meet size minimums on ${route}`, async ({ page, isMobile }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(route);

    if (isMobile) {
      // Include the widgets that only exist open.
      const menuToggle = page.getByRole('button', { name: 'Toggle navigation' });
      if (await menuToggle.isVisible()) {
        await menuToggle.click();
        await expect(page.locator('#mobile-nav')).toBeVisible();
      }
      const tocSummary = page.locator('[data-toc-details] summary');
      if (await tocSummary.isVisible()) {
        await tocSummary.click();
        await expect(page.locator('[data-toc-details] nav')).toBeVisible();
      }
    }

    await expectMinTargetSizes(page, isMobile ? 44 : 24, [
      // Revealed only on focus; its size tracks the focused content.
      '.skip-link',
    ]);
  });
}

// The larger --step-title makes long title words (Infrastructure, Deployment)
// the tightest fit on the narrowest supported viewport.
for (const route of ['/', '/projects/hostlet', '/this-page-does-not-exist'] as const) {
  test(`${route} reflows at 320px without horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(route);

    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  });
}
