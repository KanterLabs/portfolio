import { test, expect, type Page } from '@playwright/test';

async function box(page: Page, selector: string) {
  const el = page.locator(selector).first();
  const rect = await el.boundingBox();
  expect(rect, `no bounding box for ${selector}`).not.toBeNull();
  return rect!;
}

// Round-1 unification: the homepage and every case-study route hang off the
// same shell, the same left edge, and the same type ramp. These tests are
// the guard against the identity/title/prose left-edge drift the round
// fixed (100 / 290 / 542 before this change).
test.describe('shared page frame', () => {
  test('header box is identical across the homepage, case studies, and 404', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'desktop-only frame check (1440px)');

    const boxes: Record<string, { x: number; width: number }> = {};
    for (const route of [
      '/',
      '/projects/hostlet',
      '/projects/data-center-operations',
      '/this-page-does-not-exist',
    ]) {
      await page.goto(route);
      const rect = await box(page, '[data-site-header] .header-inner');
      boxes[route] = { x: rect.x, width: rect.width };
    }

    const entries = Object.entries(boxes);
    const [, reference] = entries[0];
    for (const [route, rect] of entries) {
      expect(Math.abs(rect.x - reference.x), `${route} header x`).toBeLessThanOrEqual(1);
      expect(Math.abs(rect.width - reference.width), `${route} header width`).toBeLessThanOrEqual(1);
    }
  });

  test('case-study title, prose, and header share one left edge', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop-only frame check (1440px)');

    for (const route of ['/projects/hostlet', '/projects/data-center-operations']) {
      await page.goto(route);

      const headerBox = await box(page, '[data-site-header] .header-inner');
      const h1Box = await box(page, 'h1');
      const proseBox = await box(page, '.case-prose');

      expect(Math.abs(h1Box.x - headerBox.x), `${route} h1 x vs header x`).toBeLessThanOrEqual(1);
      expect(Math.abs(proseBox.x - headerBox.x), `${route} prose x vs header x`).toBeLessThanOrEqual(1);
      expect(proseBox.width, `${route} prose width`).toBeGreaterThanOrEqual(560);
      expect(proseBox.width, `${route} prose width`).toBeLessThanOrEqual(700);
    }
  });

  test('the TOC rail sits right of the prose, flush with the header right edge', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'desktop-only frame check (1440px)');

    await page.goto('/projects/hostlet');

    const headerBox = await box(page, '[data-site-header] .header-inner');
    const proseBox = await box(page, '.case-prose');
    const tocSidebar = page.locator('.toc-sidebar');
    await expect(tocSidebar).toBeVisible();
    const tocBox = (await tocSidebar.boundingBox())!;

    expect(tocBox.x).toBeGreaterThan(proseBox.x + proseBox.width);
    expect(
      Math.abs(tocBox.x + tocBox.width - (headerBox.x + headerBox.width)),
      'toc right edge vs header right edge',
    ).toBeLessThanOrEqual(2);
  });

  // Mirrors the 779/780 nav dead-zone test at the case-study TOC's own
  // breakpoint: every width must have exactly one TOC implementation.
  test('no dead zone at the 959/960px TOC boundary', async ({ page, isMobile }) => {
    test.skip(isMobile, 'needs viewport resizing');
    await page.goto('/projects/hostlet');

    await page.setViewportSize({ width: 959, height: 900 });
    await expect(page.locator('.toc-sidebar')).toBeHidden();
    await expect(page.locator('[data-toc-details]')).toBeVisible();

    await page.setViewportSize({ width: 960, height: 900 });
    await expect(page.locator('.toc-sidebar')).toBeVisible();
    await expect(page.locator('[data-toc-details]')).toBeHidden();
  });

  test('type ramp is strictly decreasing at 390px and 1440px', async ({ page, isMobile }) => {
    test.skip(isMobile, 'needs viewport resizing');

    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });

      await page.goto('/');
      const homeH1 = await page.locator('h1').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      const homeSectionH2 = await page
        .locator('#projects h2')
        .first()
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

      await page.goto('/projects/hostlet');
      const caseH1 = await page.locator('h1').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      const caseProseH2 = await page
        .locator('.prose h2')
        .first()
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

      expect(homeH1, `home h1 > case h1 at ${width}px`).toBeGreaterThan(caseH1);
      expect(caseH1, `case h1 > home section h2 at ${width}px`).toBeGreaterThan(homeSectionH2);
      expect(homeSectionH2, `home section h2 > case prose h2 at ${width}px`).toBeGreaterThan(caseProseH2);

      if (width === 390) {
        expect(caseH1, 'case-study h1 at 390px').toBeGreaterThanOrEqual(36);
      }
      expect(caseH1, `case h1 > case prose h2 * 1.45 at ${width}px`).toBeGreaterThan(caseProseH2 * 1.45);
    }
  });

  test('mobile hero h1 sits near the top of the document, not under a void', async ({ page, isMobile }) => {
    test.skip(isMobile, 'needs viewport resizing');

    // Settle the hero-reveal entrance animation so the measured position is
    // the rest layout, not a still-animating translateY(14px) offset.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/');

    const h1 = page.locator('h1').first();
    const top = await h1.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    expect(top, 'homepage h1 document-relative top at 390px').toBeLessThan(190);
  });

  test('.field-label computes identically on the homepage and a case study', async ({ page }) => {
    await page.goto('/');
    const homeLabel = await page
      .locator('#skills .field-label')
      .first()
      .evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          letterSpacing: style.letterSpacing,
          textTransform: style.textTransform,
        };
      });

    await page.goto('/projects/hostlet');
    const caseLabel = await page
      .locator('.project-detail-facts .field-label')
      .first()
      .evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          letterSpacing: style.letterSpacing,
          textTransform: style.textTransform,
        };
      });

    expect(caseLabel).toEqual(homeLabel);
  });

  // .field-label is an unlayered rule; Tailwind's mb-* utilities live in
  // @layer utilities. If .field-label ever regains `margin: 0` it silently
  // wins the cascade over `mb-*` again, and headings that adopted the
  // shared label class (hero "Proof at a glance", "Where I am headed",
  // "Why it stands out") lose their spacing above the copy beneath them.
  test('.field-label does not clobber the mb-* utility on its call sites', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the hero proof card is hidden below 960px by design');

    await page.goto('/');
    const heroLabelMarginBottom = await page
      .locator('.hero-surface .glass h2.field-label')
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).marginBottom));

    expect(heroLabelMarginBottom, '"Proof at a glance" marginBottom').toBeGreaterThan(0);
  });

  // Explicit acceptance-criterion coverage: the Role/Scope/Outcome copy
  // blocks must all start at the same y, not vertically centre inside an
  // equal-height grid row (align-content: start on .project-detail-facts >
  // div). Without this test, reverting align-content leaves the suite green.
  test('Role/Scope/Outcome copy blocks start at the same y', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop-only: the fact grid is a single column on mobile');

    await page.goto('/projects/hostlet');

    const copyBlocks = page.locator('.project-detail-facts > div > .project-proof-copy');
    const count = await copyBlocks.count();
    expect(count).toBeGreaterThanOrEqual(3);

    const ys: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const box = await copyBlocks.nth(i).boundingBox();
      expect(box, `no bounding box for fact copy block ${i}`).not.toBeNull();
      ys.push(box!.y);
    }

    expect(Math.max(...ys) - Math.min(...ys), 'fact copy blocks y spread').toBeLessThanOrEqual(1);
  });
});
