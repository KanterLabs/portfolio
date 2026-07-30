import { expect, type Page } from '@playwright/test';

/** WCAG 2.x relative luminance of an sRGB color. */
function luminance([r, g, b]: number[]): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function parseColor(color: string): { rgb: number[]; alpha: number } | null {
  const rgbMatch = color.match(/rgba?\(([^)]+)\)/);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map((p) => parseFloat(p));
    return { rgb: parts.slice(0, 3), alpha: parts.length === 4 ? parts[3] : 1 };
  }

  // Chrome resolves color-mix(in srgb, ...) to the CSS Color 4 functional
  // notation `color(srgb r g b [/ a])`, with r/g/b as 0–1 floats rather
  // than rgb()'s 0–255 integers.
  const colorFnMatch = color.match(/color\(srgb ([^)]+)\)/);
  if (colorFnMatch) {
    const [channels, alphaPart] = colorFnMatch[1].split('/').map((p) => p.trim());
    const rgb = channels.split(/\s+/).map((p) => parseFloat(p) * 255);
    const alpha = alphaPart !== undefined ? parseFloat(alphaPart) : 1;
    return { rgb, alpha };
  }

  return null;
}

/** Composite `fg` with alpha over an opaque `bg`. */
export function composite(fg: number[], alpha: number, bg: number[]): number[] {
  return fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)));
}

export function getContrastRatio(foreground: number[], background: number[]): number {
  const l1 = luminance(foreground);
  const l2 = luminance(background);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/**
 * Resolve the effective (composited) background color behind an element by
 * walking up the tree collecting background-colors until one is opaque.
 * Exported so callers that need to composite an element's own background
 * (e.g. a bullet marker or a table-row hover state) against the page
 * beneath it — not just text color against background — can reuse it.
 */
export async function effectiveBackground(page: Page, selector: string): Promise<number[]> {
  const stack = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const backgrounds: string[] = [];
    let node: Element | null = el;
    while (node) {
      backgrounds.push(getComputedStyle(node).backgroundColor);
      node = node.parentElement;
    }
    return backgrounds;
  }, selector);
  expect(stack, `no element matches ${selector}`).not.toBeNull();

  // Composite top-down: start from an opaque base and layer upwards.
  let result = [255, 255, 255];
  for (const color of stack!.slice().reverse()) {
    const parsed = parseColor(color);
    if (!parsed || parsed.alpha === 0) continue;
    result = composite(parsed.rgb, parsed.alpha, result);
  }
  return result;
}

/**
 * Assert the contrast of pseudo-element text against the effective
 * background behind its owner. Axe cannot inspect pseudo-element text at
 * all, so rules like `.prose ol li::before` need this explicit check.
 */
export async function expectPseudoElementContrast(
  page: Page,
  selector: string,
  pseudo: '::before' | '::after',
  minimum: number
): Promise<void> {
  const styles = await page.evaluate(
    ([sel, pse]) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const computed = getComputedStyle(el, pse);
      return { color: computed.color, backgroundColor: computed.backgroundColor };
    },
    [selector, pseudo] as const
  );
  expect(styles, `no element matches ${selector}`).not.toBeNull();

  const fg = parseColor(styles!.color);
  expect(fg, `unparseable color ${styles!.color}`).not.toBeNull();

  // Layer the pseudo-element's own background over the ancestor stack,
  // then composite a semi-transparent text color onto that.
  let bg = await effectiveBackground(page, selector);
  const ownBg = parseColor(styles!.backgroundColor);
  if (ownBg && ownBg.alpha > 0) bg = composite(ownBg.rgb, ownBg.alpha, bg);
  const text = fg!.alpha < 1 ? composite(fg!.rgb, fg!.alpha, bg) : fg!.rgb;

  const ratio = getContrastRatio(text, bg);
  expect(
    ratio,
    `${selector}${pseudo} color ${styles!.color} on rgb(${bg.join(',')}) is ${ratio.toFixed(2)}:1, needs ${minimum}:1`
  ).toBeGreaterThanOrEqual(minimum);
}
