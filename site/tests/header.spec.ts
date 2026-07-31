import { test, expect, type Page } from '@playwright/test';

async function backgroundAlpha(page: Page, selector: string): Promise<number> {
  const bg = await page
    .locator(selector)
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  const match = bg.match(/rgba?\(([^)]+)\)/);
  if (!match) return 0;
  const parts = match[1].split(',').map((p) => parseFloat(p));
  return parts.length === 4 ? parts[3] : 1;
}

test.describe('site header', () => {
  for (const [label, route] of [
    ['case-study', '/projects/kanterlabs-homelab'],
    ['homepage', '/'],
  ] as const) {
    test(`${label} header gains a solid background on scroll`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(route);

      const header = page.locator('[data-site-header]');
      await expect(header).not.toHaveClass(/is-scrolled/);

      await page.evaluate(() => window.scrollTo(0, 600));
      await expect(header).toHaveClass(/is-scrolled/);
      // Poll: the background fades in over a transition.
      await expect
        .poll(() => backgroundAlpha(page, '[data-site-header] .header-inner'))
        .toBeGreaterThanOrEqual(0.9);
    });
  }

  test('open mobile nav is opaque and closes on outside click', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile nav only exists at mobile widths');
    await page.goto('/');

    const toggle = page.locator('.mobile-toggle');
    const panel = page.locator('#mobile-nav');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(panel).toBeVisible();

    // Menu items must sit on a solid surface, not 2%-alpha glass.
    expect(await backgroundAlpha(page, '#mobile-nav')).toBeGreaterThanOrEqual(0.95);

    // Tap well below the panel — outside the header — to dismiss.
    await page.mouse.click(20, 700);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(panel).toBeHidden();
  });

  // Tailwind v4 max-[780px] = (width < 780px): 780 is the first desktop
  // width and 779 the last mobile one. Every rule on this breakpoint must
  // agree, or a nav-less dead zone opens between the two modes.
  test('desktop right-hand controls are grouped at the right, not floating mid-header', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'desktop-only control grouping check');

    await page.goto('/');
    const headerInner = page.locator('[data-site-header] .header-inner');
    const headerInnerBox = (await headerInner.boundingBox())!;
    const nav = page.locator('nav[aria-label="Primary"]');
    const navBox = (await nav.boundingBox())!;
    const themeToggle = page.locator('[data-theme-toggle]');
    const themeToggleBox = (await themeToggle.boundingBox())!;

    expect(themeToggleBox.x - (navBox.x + navBox.width)).toBeLessThan(40);
    expect(navBox.x).toBeGreaterThan(headerInnerBox.x + headerInnerBox.width * 0.5);

    await page.goto('/projects/hostlet');
    const backLink = page.locator('[data-site-header]').getByRole('link', { name: 'Selected work' });
    const backLinkBox = (await backLink.boundingBox())!;
    const caseThemeToggleBox = (await page.locator('[data-theme-toggle]').boundingBox())!;
    expect(caseThemeToggleBox.x - (backLinkBox.x + backLinkBox.width)).toBeLessThan(40);
  });

  test('mobile hamburger and theme toggle sit adjacent at the right edge', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile-only control grouping check');

    await page.goto('/');
    const mobileToggle = page.locator('.mobile-toggle');
    const mobileToggleBox = (await mobileToggle.boundingBox())!;
    const themeToggleBox = (await page.locator('[data-theme-toggle]').boundingBox())!;

    expect(themeToggleBox.x - (mobileToggleBox.x + mobileToggleBox.width)).toBeLessThan(20);
  });

  test('no navigation dead zone at the 779/780px boundary', async ({ page, isMobile }) => {
    test.skip(isMobile === true, 'needs viewport resizing');
    await page.goto('/');

    await page.setViewportSize({ width: 780, height: 900 });
    await expect(page.locator('nav[aria-label="Primary"]')).toBeVisible();
    await expect(page.locator('.mobile-toggle')).toBeHidden();
    await expect(page.locator('#mobile-nav')).toBeHidden();

    await page.setViewportSize({ width: 779, height: 900 });
    await expect(page.locator('nav[aria-label="Primary"]')).toBeHidden();
    await expect(page.locator('.mobile-toggle')).toBeVisible();
    await expect(page.locator('#mobile-nav')).toBeHidden();
  });
});
