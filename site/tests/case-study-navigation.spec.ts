import { test, expect } from '@playwright/test';

for (const viewport of [{ width: 1440, height: 700 }, { width: 1024, height: 600 }]) {
  test(`case-study TOC follows scroll jumps at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/projects/kanterlabs-homelab');
    await page.evaluate(() => document.fonts.ready);

    const links = page.locator('.toc-sidebar a');
    // Jump in both directions, without clicking a TOC link or crossing every
    // intervening heading. The marker must identify the section being read.
    for (const index of [3, 1, 4, 2]) {
      const id = await links.nth(index).getAttribute('data-heading');
      await page.evaluate((headingId) => {
        const heading = document.getElementById(headingId!)!;
        window.scrollTo(0, heading.getBoundingClientRect().top + window.scrollY - 150);
      }, id);
      await expect(page.locator('.toc-link-active')).toHaveAttribute('data-heading', id!);
      await expect(page.locator('.toc-link-active')).toHaveAttribute('aria-current', 'location');
    }
  });
}
