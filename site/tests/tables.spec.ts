import { test, expect } from '@playwright/test';
import { expectNoHorizontalOverflow } from './helpers/navigation';

// Case-study tables pan inside a .table-scroll wrapper with nowrap headers.
// An overflow:hidden shorthand used to clip their right-hand columns on
// narrow screens — invisible to the page-level overflow check because
// clipping keeps document scrollWidth == clientWidth.
test('case-study tables pan horizontally instead of clipping', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'tables only overflow at mobile widths');

  await page.goto('/projects/hostlet');

  const tables = page.locator('.prose .table-scroll');
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

// A display:block table lets thead and tbody shrink-wrap independently, so
// each row group resolves its own column widths and every header drifts off
// the column it labels — 187px off on /projects/hostlet when this regressed.
test('table headers sit over the columns they label', async ({ page }) => {
  const routes = [
    '/projects/hostlet',
    '/projects/multi-node-portfolio',
    '/projects/kanterlabs-homelab',
  ];

  for (const route of routes) {
    await page.goto(route);

    const tables = await page.locator('.prose table').evaluateAll((elements) =>
      elements.map((table) => ({
        head: [...table.querySelectorAll('thead th')].map((cell) => cell.getBoundingClientRect().x),
        body: [...(table.querySelector('tbody tr')?.children ?? [])].map(
          (cell) => cell.getBoundingClientRect().x,
        ),
      })),
    );

    expect(tables.length, `${route} has no prose tables`).toBeGreaterThan(0);
    for (const { head, body } of tables) {
      expect(head.length, `${route}: header cell count`).toBeGreaterThan(0);
      expect(body, `${route}: column count`).toHaveLength(head.length);
      head.forEach((x, column) => {
        expect(Math.abs(x - body[column]), `${route}: column ${column} header vs cell`).toBeLessThan(
          1,
        );
      });
    }
  }
});

test('code blocks are keyboard-focusable scroll containers', async ({ page }) => {
  await page.goto('/projects/hostlet');

  const code = page.locator('.prose pre code').first();
  await code.scrollIntoViewIfNeeded();
  expect(await code.evaluate((el) => el.tabIndex)).toBe(0);
});
