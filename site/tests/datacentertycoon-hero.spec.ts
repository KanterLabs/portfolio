import { expect, test } from '@playwright/test';
import { ACCENT, open, box } from './helpers/dct';

test.describe('Data Center Tycoon page', () => {
  test('hero is the game main menu', async ({ page, isMobile }) => {
    await open(page);
    await expect(page.locator('.status')).toHaveText('Pre-alpha Playtesting now');
    const badge = page.locator('.prealpha-badge');
    await expect(badge).toHaveText('Pre-alpha');
    const badgeStyle = await badge.evaluate((el) => {
      const s = getComputedStyle(el);
      return { transform: s.textTransform, color: s.color, border: s.borderTopColor };
    });
    expect(badgeStyle).toEqual({ transform: 'uppercase', color: ACCENT, border: ACCENT });

    const bar = await page.locator('.title-block').evaluate((el) => {
      const s = getComputedStyle(el, '::before');
      return { width: s.width, bg: s.backgroundColor };
    });
    expect(bar).toEqual({ width: '6px', bg: ACCENT });
    const title = await page.locator('.game-title').evaluate((el) => {
      const s = getComputedStyle(el);
      return { width: s.borderBottomWidth, color: s.borderBottomColor, style: s.borderBottomStyle };
    });
    expect(title).toEqual({ width: '3px', color: ACCENT, style: 'solid' });
    await expect(page.locator('.game-title span')).toHaveText(['Data Center', 'Tycoon']);
    await expect(page.locator('.tagline')).toHaveText('Build infrastructure. Balance power. Scale your empire.');

    const h1 = page.locator('.hero h1');
    await expect(h1).toHaveText('Build it. Cool it. Keep it up.');
    const h1Style = await h1.evaluate((el) => {
      const s = getComputedStyle(el);
      return { spacing: s.letterSpacing, weight: s.fontWeight, size: parseFloat(s.fontSize) };
    });
    expect(h1Style.spacing).toBe('normal');
    expect(h1Style.weight).toBe('600');
    expect(h1Style.size).toBeGreaterThanOrEqual(24);
    expect(h1Style.size).toBeLessThanOrEqual(36);
    expect(await page.locator('.hero h1 em').evaluate((el) => getComputedStyle(el).color)).toBe(ACCENT);
    const titleSize = await page.locator('.game-title').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(titleSize).toBeGreaterThan(h1Style.size);
    await expect(page.locator('.hero img')).toHaveCount(0);
    // Section h2s never outrank the h1 (they tie on mobile, so the boundary must hold).
    const h2Sizes = await page.locator('main h2').evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
    expect(h2Sizes).toHaveLength(5);
    for (const size of h2Sizes) expect(size).toBeLessThanOrEqual(h1Style.size);

    await expect(page.locator('.fact-strip dt')).toHaveText(['Genre', 'Platform', 'Built with', 'Playtests']);
    await expect(page.locator('.fact-strip dd')).toHaveText([
      'Management sim · Tycoon',
      'PC · Linux first, Windows in progress',
      'C++20 + SDL2',
      'Small batches, by email',
    ]);
    const factColors = await page
      .locator('.fact-strip dd')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).color));
    expect(factColors).toEqual([
      'rgb(241, 245, 250)',
      'rgb(241, 245, 250)',
      'rgb(241, 245, 250)',
      'rgb(88, 190, 120)',
    ]);
    await expect(page.locator('.platform-note, .key-art, .hero-art')).toHaveCount(0);

    const copy = await box(page, '.hero-copy');
    const panel = await box(page, '.play-panel');
    if (isMobile) {
      const cta = await box(page, '.hero .dct-button.primary');
      expect(cta.y + cta.height).toBeLessThanOrEqual(844);
      const innerWidth = await page
        .locator('.play-panel')
        .evaluate((el) => el.clientWidth - parseFloat(getComputedStyle(el).paddingLeft) * 2);
      const widths = await page.locator('.hero-actions a').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
      for (const w of widths) expect(w).toBeGreaterThanOrEqual(innerWidth - 2);
    } else {
      const tops = await page
        .locator('.hero h1 > span, .hero h1 > em')
        .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
      expect(tops).toHaveLength(3);
      for (const top of tops) expect(Math.abs(top - tops[0])).toBeLessThanOrEqual(2);
      expect(panel.x).toBeGreaterThan(copy.x + copy.width);
      expect(panel.width).toBeGreaterThanOrEqual(340);
      expect(panel.width).toBeLessThanOrEqual(380);
      const skyline = await box(page, '.rack-skyline');
      expect(skyline.y).toBeGreaterThan(Math.max(copy.y + copy.height, panel.y + panel.height));
      expect(skyline.width).toBeGreaterThanOrEqual(1100);
      const strip = await box(page, '.fact-strip');
      expect(strip.y).toBeGreaterThanOrEqual(skyline.y + skyline.height);
      expect(strip.y + strip.height).toBeLessThanOrEqual(1100);
    }
  });

  test('rack skyline is a crisp, deterministic vector', async ({ page, isMobile }) => {
    await open(page);
    const skyline = page.locator('.rack-skyline');
    await expect(skyline).toHaveAttribute('aria-hidden', 'true');
    await expect(skyline.locator('img')).toHaveCount(0);
    await expect(page.locator('svg.rack')).toHaveCount(16);

    const visibleRacks = async () =>
      page.locator('svg.rack').evaluateAll((els) =>
        els
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0)
          .map((r) => ({ bottom: r.bottom, height: r.height })),
      );
    const racks = await visibleRacks();
    expect(racks).toHaveLength(isMobile ? 7 : 16);
    for (const r of racks) expect(Math.abs(r.bottom - racks[0].bottom)).toBeLessThanOrEqual(1);
    expect(new Set(racks.map((r) => Math.round(r.height))).size).toBeGreaterThanOrEqual(4);
    if (!isMobile) {
      const tallest = Math.max(...racks.map((r) => r.height));
      expect(tallest).toBeGreaterThanOrEqual(160);
      expect(tallest).toBeLessThanOrEqual(260);
    }

    expect(await page.locator('.rack .led').count()).toBeGreaterThan(50);
    expect(await page.locator('.rack .led-white').count()).toBeGreaterThanOrEqual(1);
    const green = await page
      .locator('.rack .led:not(.led-white)')
      .first()
      .evaluate((el) => getComputedStyle(el).fill);
    expect(green).toBe('rgb(88, 190, 120)');

    await page.setViewportSize({ width: 900, height: 900 });
    await page.reload();
    await page.evaluate(() => document.fonts.ready);
    const mid = await visibleRacks();
    expect(mid).toHaveLength(11);
    for (const r of mid) expect(Math.abs(r.bottom - mid[0].bottom)).toBeLessThanOrEqual(1);
  });
});
