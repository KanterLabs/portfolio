import { test, expect, type Page } from '@playwright/test';
import { composite, effectiveBackground, getContrastRatio, parseColor } from './helpers/contrast';

// Both themes are the same design, not a dark design with a light
// fallback. These checks catch the specific failure mode where a color
// literal (rgba(255,255,255,.05) etc.) was written against the dark
// palette and silently disappears in light mode.

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/projects/hostlet');
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
