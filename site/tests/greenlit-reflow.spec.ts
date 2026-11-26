import { expect, test } from '@playwright/test';

for (const fontSize of ['100%', '200%']) {
  test(`Greenlit copy and controls reflow at 320px and ${fontSize} text`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/greenlit/');
    await page.evaluate((size) => { document.documentElement.style.fontSize = size; }, fontSize);
    await page.evaluate(() => document.fonts.ready);
    const clipped = await page.locator('.greenlit-shell').evaluate((shell) => {
      const failures: string[] = [];
      const walker = document.createTreeWalker(shell, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const parent = node.parentElement!;
        // Decorative terminal and marquee content is not meaningful page copy.
        if (!node.textContent?.trim() || parent.closest('[aria-hidden="true"], .terminal-wrap')) continue;
        if (!parent.getClientRects().length) continue;
        let left = 0, right = innerWidth;
        for (let ancestor: Element | null = parent; ancestor; ancestor = ancestor.parentElement) {
          if (['hidden', 'clip', 'auto', 'scroll'].includes(getComputedStyle(ancestor).overflowX)) {
            const box = ancestor.getBoundingClientRect();
            left = Math.max(left, box.left); right = Math.min(right, box.right);
          }
        }
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (rect.left < left - 1 || rect.right > right + 1) failures.push(node.textContent!.trim());
        }
      }
      for (const link of shell.querySelectorAll('a')) {
        if (!link.getClientRects().length) continue;
        const rect = link.getBoundingClientRect();
        if (rect.left < -1 || rect.right > innerWidth + 1) failures.push(`control: ${link.textContent?.trim()}`);
      }
      return [...new Set(failures)];
    });
    expect(clipped).toEqual([]);
  });
}
