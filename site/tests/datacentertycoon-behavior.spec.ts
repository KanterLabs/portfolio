import { expect, test } from '@playwright/test';
import { PLAYTEST_HREF, DISCORD_HREF, ACCENT, expectNoOverflow, open } from './helpers/dct';
import { expectHashLinkToReachSection } from './helpers/navigation';

test.describe('Data Center Tycoon page', () => {
  test('Discord is the primary ask in the hero, nav, and closing', async ({ page }) => {
    await open(page);
    const heroLinks = page.locator('.hero-actions a');
    await expect(heroLinks).toHaveCount(3);
    await expect(heroLinks.first()).toHaveAccessibleName('Join the Discord');
    await expect(heroLinks.first()).toHaveAttribute('href', DISCORD_HREF);
    await expect(heroLinks.first()).toHaveClass(/primary/);
    await expect(heroLinks.nth(1)).toHaveAttribute('href', PLAYTEST_HREF);
    // Visible in the nav at every viewport, including mobile where section links hide.
    await expect(page.locator('.dct-nav').getByRole('link', { name: 'Discord', exact: true })).toBeVisible();
    const hrefs = await page.locator('a[href*="discord"]').evaluateAll((els) => els.map((el) => el.getAttribute('href')));
    expect(hrefs).toHaveLength(3);
    for (const href of hrefs) expect(href).toBe(DISCORD_HREF);
    await expectNoOverflow(page);
  });

  test('nav portfolio link keeps its name and swaps to a short label on mobile', async ({ page, isMobile }) => {
    await open(page);
    const nav = page.locator('.dct-nav');
    const portfolio = nav.getByRole('link', { name: "Shane's portfolio" });
    await expect(portfolio).toHaveCount(1);
    await expect(portfolio).toBeVisible();
    await expect(portfolio).toHaveAttribute('href', '/');
    await expect(portfolio).toHaveClass(/\bdct-button\b/);
    await expect(portfolio).toHaveClass(/\bquiet\b/);
    expect((await portfolio.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const brandText = nav.locator('.brand-text');
    if (isMobile) {
      await expect(portfolio.locator('.nav-short')).toBeVisible();
      await expect(portfolio.locator('.nav-short')).toHaveText('Portfolio');
      // The full label stays in the accessible name but is clipped visually.
      expect((await portfolio.locator('.nav-label').boundingBox())!.width).toBeLessThanOrEqual(1);
      expect((await brandText.boundingBox())?.width ?? 0).toBeLessThanOrEqual(1);
    } else {
      await expect(portfolio.locator('.nav-label')).toBeVisible();
      await expect(portfolio.locator('.nav-short')).toBeHidden();
      await expect(brandText).toBeVisible();
      await expect(brandText).toHaveText('Data Center Tycoon');
    }
  });

  test('every playtest mailto link is identical', async ({ page }) => {
    await open(page);
    const hrefs = await page.locator('a[href^="mailto:"]').evaluateAll((els) => els.map((el) => el.getAttribute('href')));
    expect(hrefs.length).toBeGreaterThanOrEqual(3);
    for (const href of hrefs) expect(href).toBe(PLAYTEST_HREF);
  });

  test('headings run in order', async ({ page }) => {
    await open(page);
    const levels = await page.locator('main h1, main h2, main h3').evaluateAll((els) =>
      els.map((el) => Number(el.tagName[1])),
    );
    expect(levels[0]).toBe(1);
    levels.forEach((level, i) => {
      if (i > 0) expect(level - levels[i - 1]).toBeLessThanOrEqual(1);
    });
    expect(levels.filter((l) => l === 2)).toHaveLength(5);
  });

  test('keyboard focus shows a solid ring', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard focus is a pointer-device concern');
    await open(page);
    for (const selector of ['.dct-nav .nav-discord', '.hero .dct-button.primary', '.shot-frame']) {
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      let focused = false;
      for (let i = 0; i < 40 && !focused; i++) {
        await page.keyboard.press('Tab');
        focused = await page.evaluate((sel) => document.activeElement === document.querySelector(sel), selector);
      }
      expect(focused, `${selector} never received focus`).toBe(true);
      // Reduced motion still runs a ~0.01ms `transition: all`, so let the ring settle before reading it.
      await expect
        .poll(() =>
          page.evaluate((sel) => {
            const s = getComputedStyle(document.querySelector(sel)!);
            return { style: s.outlineStyle, wide: parseFloat(s.outlineWidth) >= 2, color: s.outlineColor };
          }, selector),
        )
        .toEqual({ style: 'solid', wide: true, color: ACCENT });
    }
  });

  test('LED twinkle only runs when motion is allowed', async ({ page }) => {
    await open(page, 'no-preference');
    expect(await page.locator('.led-blink').first().evaluate((el) => getComputedStyle(el).animationName)).not.toBe('none');
  });

  test('reduced motion disables the blink and the zoom', async ({ page, isMobile }) => {
    await open(page, 'reduce');
    expect(await page.locator('.led-blink').first().evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    test.skip(isMobile, 'hover only applies with a pointer');
    const frame = page.locator('.shot-frame').first();
    await frame.scrollIntoViewIfNeeded();
    await frame.hover();
    expect(await frame.locator('img').evaluate((el) => getComputedStyle(el).transform)).toBe('none');
  });

  test('hover zooms the screenshot when motion is allowed', async ({ page, isMobile }) => {
    test.skip(isMobile, 'hover only applies with a pointer');
    await open(page, 'no-preference');
    const frame = page.locator('.shot-frame').first();
    await frame.scrollIntoViewIfNeeded();
    await frame.hover();
    await expect
      .poll(() => frame.locator('img').evaluate((el) => getComputedStyle(el).transform))
      .not.toBe('none');
  });

  test.describe('light OS preference', () => {
    test.use({ colorScheme: 'light' });
    test('stays dark', async ({ page }) => {
      await open(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(30, 39, 51)');
    });
  });

  test('does not overflow horizontally at the viewport width', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'covered at 390px by the mobile project');
    await open(page);
    await expectNoOverflow(page);
  });

  test('does not overflow horizontally at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await open(page);
    await expectNoOverflow(page);
  });

  test('reflows at 320px with text enlarged to 200%', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await open(page);
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await expectNoOverflow(page);
    await expect(page.locator('.dct-nav').getByRole('link', { name: /portfolio/i })).toBeVisible();
  });

  test('hash links land on their sections', async ({ page, isMobile }) => {
    await open(page);
    if (!isMobile) {
      await expectHashLinkToReachSection(
        page,
        () => page.locator('.dct-nav').getByRole('link', { name: 'Gameplay' }).click(),
        'gameplay',
      );
    }
    await page.goto('/datacentertycoon');
    await expectHashLinkToReachSection(
      page,
      () => page.locator('.hero').getByRole('link', { name: /See the game/ }).click(),
      'screens',
    );
  });
});
