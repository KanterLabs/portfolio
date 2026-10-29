import { test, expect, type Page } from '@playwright/test';
import { composite, effectiveBackground, getContrastRatio, parseColor } from './helpers/contrast';

// Both themes are the same design, not a dark design with a light
// fallback. These checks catch the specific failure mode where a color
// literal (rgba(255,255,255,.05) etc.) was written against the dark
// palette and silently disappears in light mode.

async function setTheme(page: Page, theme: 'light' | 'dark', path = '/projects/helm') {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.clear());
  await page.goto(path);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function computedColor(
  page: Page,
  selector: string,
  property: 'backgroundColor' | 'borderBottomColor',
  pseudo?: '::before',
) {
  return page.evaluate(
    ([sel, prop, pse]) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const style = getComputedStyle(el, pse as string | undefined);
      return (style as unknown as Record<string, string>)[prop as string];
    },
    [selector, property, pseudo] as const,
  );
}

for (const theme of ['light', 'dark'] as const) {
  test(`.prose ul li bullet clears 3:1 contrast in ${theme} theme`, async ({ page }) => {
    await setTheme(page, theme);

    const raw = await computedColor(page, '.prose ul li', 'backgroundColor', '::before');
    expect(raw, 'bullet background-color').not.toBeNull();
    const parsed = parseColor(raw!);
    expect(parsed, `unparseable color ${raw}`).not.toBeNull();

    const pageBg = await effectiveBackground(page, '.prose ul li');
    const swatch = parsed!.alpha < 1 ? composite(parsed!.rgb, parsed!.alpha, pageBg) : parsed!.rgb;
    const ratio = getContrastRatio(swatch, pageBg);

    expect(ratio, `bullet ${raw} on rgb(${pageBg.join(',')}) is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
  });

  test(`.prose blockquote rule stays visible in ${theme} theme`, async ({ page }) => {
    await setTheme(page, theme);

    // No case study currently uses a blockquote in its MDX body — content
    // is out of scope for this round — so the rule is checked by mounting
    // a throwaway element inside the real `.prose` container rather than
    // depending on a specific page having one.
    const raw = await page.evaluate(() => {
      const prose = document.querySelector('.prose');
      if (!prose) return null;
      const blockquote = document.createElement('blockquote');
      prose.appendChild(blockquote);
      const color = getComputedStyle(blockquote).borderLeftColor;
      blockquote.remove();
      return color;
    });

    expect(raw, 'blockquote border-left-color').not.toBeNull();
    const parsed = parseColor(raw!);
    expect(parsed, `unparseable color ${raw}`).not.toBeNull();

    expect(parsed!.alpha, `blockquote border-left alpha in ${theme}`).toBeGreaterThanOrEqual(0.25);
  });
}

test('.prose td row separators are visible and differ between themes', async ({ page }) => {
  const values: Record<'light' | 'dark', string> = { light: '', dark: '' };

  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);

    const raw = await computedColor(page, '.prose td', 'borderBottomColor');
    expect(raw, 'td border-bottom-color').not.toBeNull();
    const parsed = parseColor(raw!);
    expect(parsed, `unparseable color ${raw}`).not.toBeNull();
    expect(parsed!.alpha, `td border-bottom alpha in ${theme}`).toBeGreaterThan(0);

    const cellBg = await effectiveBackground(page, '.prose td');
    const border = parsed!.alpha < 1 ? composite(parsed!.rgb, parsed!.alpha, cellBg) : parsed!.rgb;
    const ratio = getContrastRatio(border, cellBg);
    expect(ratio, `td border ${raw} on rgb(${cellBg.join(',')}) is ${ratio.toFixed(2)}:1 in ${theme}`).toBeGreaterThan(
      1.05,
    );

    values[theme] = raw!;
  }

  // The single inequality that catches "the light and dark values are the
  // same literal" — the rgba(255,255,255,.05)-on-white bug this round fixed.
  expect(values.light, 'light vs dark td border-bottom-color must differ').not.toBe(values.dark);
});

for (const theme of ['light', 'dark'] as const) {
  // Linework is the whole design: the cabinet, unit faceplates, and drawing
  // boxes must clear the WCAG 1.4.11 non-text minimum against the paper.
  test(`drawing linework clears 3:1 in ${theme}`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'The cabinet outline is the desktop drawing; phones use the unit list');
    await setTheme(page, theme, '/kanterlabs');

    for (const [route, selector, pseudo] of [
      ['/kanterlabs', '#kanterlabs .rack', '::before'],
      ['/kanterlabs', '#kanterlabs .rack-row[data-kind="repo"] .rack-face', undefined],
      ['/projects', '#detail-a .dd-node', undefined],
    ] as const) {
      await page.goto(route);
      const raw = await page.locator(selector).first().evaluate(
        (el, pse) => getComputedStyle(el, pse ?? undefined).borderTopColor,
        pseudo,
      );
      const parsed = parseColor(raw);
      expect(parsed, `unparseable ${selector} border ${raw}`).not.toBeNull();
      const bg = await effectiveBackground(page, 'main');
      const line = parsed!.alpha < 1 ? composite(parsed!.rgb, parsed!.alpha, bg) : parsed!.rgb;
      const ratio = getContrastRatio(line, bg);
      expect(ratio, `${selector} line ${raw} is ${ratio.toFixed(2)}:1 in ${theme}`).toBeGreaterThanOrEqual(3);
    }
  });

  test(`the lead callout bubble clears AA in ${theme}`, async ({ page }) => {
    await setTheme(page, theme, '/kanterlabs');

    const bubble = page.locator('#kanterlabs .rack-row[data-kind="lead"] .rack-num');
    const { color, background } = await bubble.evaluate((el) => {
      const style = getComputedStyle(el);
      return { color: style.color, background: style.backgroundColor };
    });
    const fg = parseColor(color);
    const bg = parseColor(background);
    expect(bg!.alpha, 'the lead bubble is filled').toBe(1);
    const ratio = getContrastRatio(fg!.rgb, bg!.rgb);
    expect(ratio, `lead bubble ${color} on ${background} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  test(`detail-drawing connectors stay visible in ${theme}`, async ({ page }) => {
    await setTheme(page, theme, '/projects');

    const raw = await page
      .locator('#detail-a .dd-connector span')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    const parsed = parseColor(raw);
    expect(parsed, `unparseable color ${raw}`).not.toBeNull();

    const bg = await effectiveBackground(page, '#detail-a .dd-body');
    const line = parsed!.alpha < 1 ? composite(parsed!.rgb, parsed!.alpha, bg) : parsed!.rgb;
    const ratio = getContrastRatio(line, bg);
    expect(ratio, `connector ${raw} on rgb(${bg.join(',')}) is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
  });

  test(`--plate is distinguishable from --color-bg in ${theme}`, async ({ page }) => {
    await setTheme(page, theme, '/');

    const { plateRaw, bgRaw } = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return { plateRaw: style.getPropertyValue('--plate'), bgRaw: style.getPropertyValue('--color-bg') };
    });

    // --plate is a color-mix() expression, not a literal color — resolve it
    // by painting it onto a throwaway element and reading back the
    // computed (browser-resolved) backgroundColor. Two separate elements:
    // reusing one element's `background` shorthand across two assignments
    // makes Chromium serialize the second (plain) color as oklab() instead
    // of rgb(), which parseColor doesn't handle.
    const { plateResolved, bgResolved } = await page.evaluate(
      ([plate, bg]) => {
        const plateProbe = document.createElement('div');
        plateProbe.style.backgroundColor = plate;
        document.body.appendChild(plateProbe);
        const plateResolved = getComputedStyle(plateProbe).backgroundColor;
        plateProbe.remove();

        const bgProbe = document.createElement('div');
        bgProbe.style.backgroundColor = bg;
        document.body.appendChild(bgProbe);
        const bgResolved = getComputedStyle(bgProbe).backgroundColor;
        bgProbe.remove();

        return { plateResolved, bgResolved };
      },
      [plateRaw, bgRaw] as const,
    );

    const plateParsed = parseColor(plateResolved);
    const bgParsed = parseColor(bgResolved);
    expect(plateParsed, `unparseable --plate ${plateResolved}`).not.toBeNull();
    expect(bgParsed, `unparseable --color-bg ${bgResolved}`).not.toBeNull();

    const diverges = plateParsed!.rgb.some((channel, i) => Math.abs(channel - bgParsed!.rgb[i]) >= 3);
    expect(
      diverges,
      `--plate rgb(${plateParsed!.rgb.join(',')}) vs --color-bg rgb(${bgParsed!.rgb.join(',')}) must differ by >=3 in a channel`,
    ).toBe(true);
  });

  test(`.field-label on the plate clears 4.5:1 in ${theme}`, async ({ page }) => {
    await setTheme(page, theme, '/projects/helm');

    const label = page.locator('.project-detail-facts .field-label').first();
    await expect(label).toBeVisible();

    const raw = await label.evaluate((el) => getComputedStyle(el).color);
    const parsed = parseColor(raw);
    expect(parsed, `unparseable color ${raw}`).not.toBeNull();

    const plateBg = await effectiveBackground(page, '.project-detail-facts > div');
    const text = parsed!.alpha < 1 ? composite(parsed!.rgb, parsed!.alpha, plateBg) : parsed!.rgb;

    const ratio = getContrastRatio(text, plateBg);
    expect(
      ratio,
      `.field-label ${raw} on plate rgb(${plateBg.join(',')}) is ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(4.5);
  });

  // Reverting --panel to its old translucent value, or restoring the
  // deleted light-theme `background: transparent` override for the fact
  // plates, would leave every other assertion in this file green — none
  // of them read backgroundColor directly. These two do.
  test(`.project-detail-facts fact plate has a non-transparent background in ${theme}`, async ({ page }) => {
    await setTheme(page, theme, '/projects/helm');

    const plate = page.locator('.project-detail-facts > div').first();
    await expect(plate).toBeVisible();

    const raw = await plate.evaluate((el) => getComputedStyle(el).backgroundColor);
    const parsed = parseColor(raw);
    expect(parsed, `unparseable color ${raw}`).not.toBeNull();
    expect(parsed!.alpha, `.project-detail-facts > div backgroundColor ${raw} in ${theme}`).toBeGreaterThan(0);
  });
}

for (const theme of ['light', 'dark'] as const) {
  // Boxes on the sheet must mask the drawing grid behind them, or the
  // grid lines run through every table and card.
  test(`drawn surfaces are opaque paper in ${theme}`, async ({ page }) => {
    await setTheme(page, theme, '/');
    const pageBg = parseColor(await page.evaluate(() => getComputedStyle(document.body).backgroundColor))!;

    for (const [route, selector] of [
      ['/', '#projects .dwg-box'],
      ['/', '#skills .dwg-table'],
      ['/', '#contact .title-block'],
      ['/kanterlabs', '#kanterlabs .rack-row[data-kind="repo"] .rack-face'],
    ]) {
      await page.goto(route);
      const raw = await page.locator(selector).first().evaluate((el) => getComputedStyle(el).backgroundColor);
      const parsed = parseColor(raw);
      expect(parsed, `unparseable ${selector} background ${raw}`).not.toBeNull();
      expect(parsed!.alpha, `${selector} background ${raw} must be opaque in ${theme}`).toBe(1);
      expect(parsed!.rgb, `${selector} is paper-coloured in ${theme}`).toEqual(pageBg.rgb);
    }

    await page.goto('/');
    const shadow = await page
      .locator('#projects .dwg-btn')
      .first()
      .evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow, 'drawn buttons carry their offset shadow').not.toBe('none');
  });
}

test('--shadow-card is set and theme-specific', async ({ page }) => {
  const values: Record<'light' | 'dark', string> = { light: '', dark: '' };

  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme, '/');

    const raw = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--shadow-card').trim(),
    );
    expect(raw, `--shadow-card in ${theme}`).not.toBe('');
    expect(raw, `--shadow-card in ${theme}`).not.toBe('none');
    values[theme] = raw;
  }

  expect(values.light, 'light vs dark --shadow-card must differ').not.toBe(values.dark);
});
