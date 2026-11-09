import { expect, test } from '@playwright/test';
import { expectTextOverImageContrast, getContrastRatio, parseColor } from './helpers/contrast';
import { PLAYTEST_HREF, DISCORD_HREF, BORDER, open, box } from './helpers/dct';

test.describe('Data Center Tycoon page', () => {
  test('Inter is the only typeface', async ({ page }) => {
    await open(page);
    const result = await page.evaluate(() => {
      const families = new Map<string, number>();
      for (const el of document.querySelectorAll('.dct-shell, .dct-shell *, .site-footer, .site-footer *')) {
        const first = getComputedStyle(el).fontFamily.split(',')[0].trim();
        families.set(first, (families.get(first) ?? 0) + 1);
        const all = getComputedStyle(el).fontFamily;
        if (/Space Grotesk|IBM Plex Mono|Instrument Serif|monospace/i.test(all)) families.set(`BAD ${all}`, 1);
      }
      return {
        families: [...families.keys()],
        regular: document.fonts.check('400 16px Inter'),
        semibold: document.fonts.check('600 16px Inter'),
      };
    });
    expect(result.families.filter((f) => !/^"?Inter"?$/.test(f))).toEqual([]);
    expect(result.regular).toBe(true);
    expect(result.semibold).toBe(true);
    for (const selector of ['body', 'h1', '.game-title', 'h2', '.dct-button', '.fig-label', '.step-num', '.spec-grid dt', '.site-footer']) {
      const family = await page.locator(selector).first().evaluate((el) => getComputedStyle(el).fontFamily);
      expect(family, selector).toMatch(/^"?Inter"?,/);
    }
  });

  test('no neon, glow or radial bloom remains', async ({ page }) => {
    await open(page);
    const vars = await page.locator('.dct-shell').evaluate((el) => {
      const s = getComputedStyle(el);
      return Object.fromEntries(
        ['panel', 'header', 'border', 'text', 'muted', 'accent', 'primary', 'primary-pressed', 'success', 'ov-cooling', 'ov-service'].map(
          (name) => [name, s.getPropertyValue(`--dct-${name}`).trim()],
        ),
      );
    });
    expect(vars).toEqual({
      panel: '#212b37',
      header: '#1b2430',
      border: '#3a4656',
      text: '#f1f5fa',
      muted: '#b6c3d3',
      accent: '#b5d0f4',
      primary: '#2f7fd8',
      'primary-pressed': '#2669b5',
      success: '#58be78',
      'ov-cooling': '#48c3eb',
      'ov-service': '#b973eb',
    });

    const offenders = await page.evaluate(() => {
      const banned = ['rgb(95, 212, 255)', 'rgb(242, 193, 78)'];
      const colorProps = [
        'color', 'backgroundColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
        'outlineColor', 'fill', 'stroke',
      ] as const;
      const found: string[] = [];
      const label = (el: Element) => `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').split(' ')[0]}`;
      for (const el of document.querySelectorAll('.dct-shell, .dct-shell *, body')) {
        const s = getComputedStyle(el);
        for (const prop of colorProps) if (banned.includes(s[prop])) found.push(`${label(el)} ${prop} ${s[prop]}`);
        if (s.textShadow !== 'none') found.push(`${label(el)} text-shadow ${s.textShadow}`);
        if (s.boxShadow !== 'none' && s.boxShadow.replace(/rgba\(0, 0, 0, [\d.]+\)/g, '').includes('rgb')) {
          found.push(`${label(el)} box-shadow ${s.boxShadow}`);
        }
        if (s.backgroundImage.includes('radial-gradient')) found.push(`${label(el)} radial-gradient`);
      }
      return found;
    });
    expect(offenders).toEqual([]);
  });

  test('game buttons share one accessible blue and grey language', async ({ page, isMobile }) => {
    await open(page);
    const white = [255, 255, 255];
    for (const selector of ['.dct-nav .nav-discord', '.hero .dct-button.primary', '.closing .dct-button.primary']) {
      const link = page.locator(selector);
      await expect(link, selector).toHaveAttribute('href', DISCORD_HREF);
      await expect(link, selector).toHaveClass(/dct-button/);
      await expect(link, selector).toHaveClass(/primary/);
      const style = await link.evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          bg: s.backgroundColor,
          color: s.color,
          border: s.borderTopColor,
          radius: s.borderTopLeftRadius,
          height: el.getBoundingClientRect().height,
        };
      });
      expect(style, selector).toMatchObject({
        bg: 'rgb(38, 105, 181)',
        color: 'rgb(255, 255, 255)',
        border: 'rgb(74, 149, 234)',
        radius: '8px',
      });
      expect(style.height, selector).toBeGreaterThanOrEqual(44);
      expect(getContrastRatio(white, parseColor(style.bg)!.rgb), selector).toBeGreaterThanOrEqual(4.5);
    }

    if (!isMobile) {
      const hero = page.locator('.hero .dct-button.primary');
      await hero.hover();
      await expect.poll(() => hero.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(42, 111, 190)');
      expect(getContrastRatio(white, parseColor('rgb(42, 111, 190)')!.rgb)).toBeGreaterThanOrEqual(4.5);
    }

    const secondary = await page
      .locator('a.dct-button.secondary')
      .evaluateAll((els) => els.map((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).borderTopColor]));
    expect(secondary).toHaveLength(2);
    for (const [bg, border] of secondary) {
      expect(bg).toBe('rgb(57, 72, 89)');
      expect(border).toBe('rgb(69, 86, 106)');
    }
    const seeGame = page.locator('.see-game');
    await expect(seeGame).toHaveClass(/dct-button/);
    await expect(seeGame).toHaveClass(/quiet/);
    expect(await seeGame.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(182, 195, 211)');
    await expect(page.locator('.hero-actions a')).toHaveCount(3);
    const hrefs = await page.locator('.hero-actions a').evaluateAll((els) => els.map((el) => el.getAttribute('href')));
    expect(hrefs).toEqual([DISCORD_HREF, PLAYTEST_HREF, '#screens']);
    await expect(page.locator('.dct-button').filter({ hasText: '→' })).toHaveCount(0);
  });

  test('panels match the game', async ({ page }) => {
    await open(page);
    const panels = await page.locator('.dct-panel').evaluateAll((els) =>
      els.map((el) => {
        const s = getComputedStyle(el);
        return { bg: s.backgroundColor, border: s.borderTopColor, radius: s.borderTopLeftRadius, shadow: s.boxShadow };
      }),
    );
    expect(panels.length).toBeGreaterThanOrEqual(8);
    for (const p of panels) {
      expect(p.bg).toBe('rgb(33, 43, 55)');
      expect(p.border).toBe(BORDER);
      expect(p.radius).toBe('17px');
      expect(p.shadow).not.toBe('none');
    }
    const headed = await page
      .locator('.loop-panel, .systems-panel, .build-panel, .closing, .pillar-grid > article')
      .evaluateAll((els) =>
        els.map((el) => {
          const header = el.querySelector('.dct-panel-header');
          const s = header ? getComputedStyle(header) : null;
          return s && { color: s.borderBottomColor, width: s.borderBottomWidth };
        }),
      );
    expect(headed).toHaveLength(7);
    for (const h of headed) expect(h).toEqual({ color: BORDER, width: '1px' });

    await expect(page.locator('.pillar-grid .status-pill')).toHaveText(['Infrastructure', 'Business', 'Growth']);
    const dots = await page
      .locator('.pillar-grid .status-pill .dot')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
    expect(dots).toEqual(['rgb(72, 195, 235)', 'rgb(88, 190, 120)', 'rgb(235, 185, 65)']);

    await expect(page.locator('.eyebrow')).toHaveText([
      'Core loop · 6',
      'In game · 3',
      "What you're running · 3",
      'Under the hood · 8',
    ]);
    const eyebrows = await page.locator('.eyebrow').evaluateAll((els) =>
      els.map((el) => {
        const s = getComputedStyle(el);
        return `${s.fontSize}|${s.fontWeight}|${s.textTransform}|${s.color}|${s.letterSpacing}`;
      }),
    );
    for (const e of eyebrows) expect(e).toBe('12px|600|uppercase|rgb(182, 195, 211)|normal');
    const facts = await page.locator('.fact-strip dt').evaluateAll((els) =>
      els.map((el) => {
        const s = getComputedStyle(el);
        return `${s.fontSize}|${s.fontWeight}|${s.textTransform}|${s.color}`;
      }),
    );
    for (const f of facts) expect(f).toBe('12px|600|uppercase|rgb(182, 195, 211)');

    for (const title of ['Play', 'Core loop', 'Systems', "How it's built", 'Your first rack is waiting']) {
      const el = page.locator('p.panel-title', { hasText: new RegExp(`^${title}$`) });
      await expect(el, title).toHaveCount(1);
    }
  });

  test('hero and closing text meets AA', async ({ page }) => {
    await open(page);
    // The primary button is covered by 'game buttons': its #4a95ea border would be sampled as backdrop.
    for (const selector of [
      '.prealpha-badge',
      '.status-pill',
      '.game-title',
      '.tagline',
      '.hero h1 > span:first-child',
      '.hero h1 em',
      '.hero-lede',
      '.play-panel .panel-title',
      '.closing h2',
      '.closing-copy > p:not(.closing-note)',
      '.closing-note',
      '.fact-strip dd',
    ]) {
      await expectTextOverImageContrast(page, selector);
    }
  });
});
