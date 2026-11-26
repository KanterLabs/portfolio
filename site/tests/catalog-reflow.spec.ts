import { expect, test } from '@playwright/test';

for (const fontSize of ['100%', '200%']) {
  test(`catalog links and header reflow at 320px with ${fontSize} text`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/kanterlabs/');
    await page.evaluate((size) => { document.documentElement.style.fontSize = size; }, fontSize);
    await page.evaluate(() => document.fonts.ready);

    const result = await page.locator('.catalog-page').evaluate((catalog) => {
      const clipped: string[] = [];
      const walker = document.createTreeWalker(catalog, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const parent = node.parentElement!;
        // Rack faceplates duplicate the accessible callouts; screen-reader-only
        // labels and scripts are not visible page copy.
        if (!node.textContent?.trim() || parent.closest('[aria-hidden="true"], .sr-only, script, style')) continue;
        if (!parent.getClientRects().length) continue;
        let left = 0, right = innerWidth;
        for (let ancestor: Element | null = parent; ancestor; ancestor = ancestor.parentElement) {
          if (['hidden', 'clip', 'auto', 'scroll'].includes(getComputedStyle(ancestor).overflowX)) {
            const box = ancestor.getBoundingClientRect();
            left = Math.max(left, box.left);
            right = Math.min(right, box.right);
          }
        }
        const range = document.createRange();
        range.selectNodeContents(node);
        if ([...range.getClientRects()].some((r) => r.left < left - 1 || r.right > right + 1)) {
          clipped.push(node.textContent!.trim());
        }
      }
      const brand = catalog.querySelector('.header-brand-text')!.getBoundingClientRect();
      const controls = catalog.querySelector('.header-back')!.parentElement!.getBoundingClientRect();
      return {
        clipped: [...new Set(clipped)],
        horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
        headerOverlap: Math.min(brand.right, controls.right) > Math.max(brand.left, controls.left)
          && Math.min(brand.bottom, controls.bottom) > Math.max(brand.top, controls.top),
      };
    });
    expect(result.clipped).toEqual([]);
    expect(result.horizontalOverflow).toBeLessThanOrEqual(1);
    expect(result.headerOverlap).toBe(false);

    await page.getByRole('link', { name: 'Flagship projects', exact: true }).click();
    await expect.poll(() => page.evaluate(() => {
      const header = document.querySelector('[data-site-header]')!.getBoundingClientRect();
      const heading = document.querySelector('#plates-title')!.getBoundingClientRect();
      return heading.top >= header.bottom - 1 && heading.top < innerHeight;
    })).toBe(true);
  });
}
