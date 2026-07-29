import { test, expect } from '@playwright/test';
import { expectNoHorizontalOverflow } from './helpers/navigation';

// Case-study tables use display:block + overflow-x:auto with nowrap
// headers. An overflow:hidden shorthand used to clip their right-hand
// columns on narrow screens — invisible to the page-level overflow check
// because clipping keeps document scrollWidth == clientWidth.
test('case-study tables pan horizontally instead of clipping', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'tables only overflow at mobile widths');

  await page.goto('/projects/hostlet');

  const tables = page.locator('.prose table');
  const count = await tables.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i += 1) {
    const table = tables.nth(i);
    await table.scrollIntoViewIfNeeded();

    const metrics = await table.evaluate((el) => ({
      overflowX: getComputedStyle(el).overflowX,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      tabIndex: el.tabIndex,
    }));

    expect(metrics.overflowX).toBe('auto');
    // Scrollable regions must be reachable by keyboard (WCAG 2.1.1).
    expect(metrics.tabIndex).toBe(0);

    if (metrics.scrollWidth > metrics.clientWidth) {
      // The overflowing content must actually be reachable by panning.
      const scrolled = await table.evaluate((el) => {
        el.scrollLeft = 60;
        return el.scrollLeft;
      });
      expect(scrolled).toBeGreaterThan(0);
    }
  }

  // The table scrolls inside its own container — the page must not.
  await expectNoHorizontalOverflow(page);
});

test('code blocks are keyboard-focusable scroll containers', async ({ page }) => {
  await page.goto('/projects/hostlet');

  const code = page.locator('.prose pre code').first();
  await code.scrollIntoViewIfNeeded();
  expect(await code.evaluate((el) => el.tabIndex)).toBe(0);
});
