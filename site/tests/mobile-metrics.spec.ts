import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('mobile homepage metrics and content spot checks', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.waitForTimeout(600);

  const metrics = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    h1: document.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim(),
    heroParagraph: document.querySelector('.hero-copy')?.textContent?.replace(/\s+/g, ' ').trim(),
    contactText: document.getElementById('contact')?.textContent ?? '',
    sectionTops: ['kanterlabs', 'projects', 'plates', 'about', 'skills', 'contact'].map((id) => ({
      id,
      top: Math.round(
        (document.getElementById(id)?.getBoundingClientRect().top ?? 0) + window.scrollY,
      ),
    })),
  }));

  console.log('Mobile metrics:', JSON.stringify(metrics, null, 2));

  expect(metrics.hasHorizontalOverflow).toBe(false);
  // Six sheets, the rack as a unit list, and five media plates in a
  // single column. The budget still catches runaway growth past that.
  expect(metrics.scrollHeight).toBeLessThan(15000);
  expect(metrics.h1).toBe('Everything I run, in one rack.');
  expect(metrics.heroParagraph).toContain('production servers at InterServer');
  expect(metrics.contactText).toContain('shanekanterman04@gmail.com');
  expect(metrics.contactText).toContain('Cranford');
  // The rack is the body of work: it starts within the first screen,
  // and the sheets follow in order.
  expect(metrics.sectionTops[0]?.id).toBe('kanterlabs');
  expect(metrics.sectionTops[0]?.top).toBeLessThan(750);
  for (let i = 1; i < metrics.sectionTops.length; i += 1) {
    expect(metrics.sectionTops[i - 1].top).toBeLessThan(metrics.sectionTops[i].top);
  }

  // Keep the capture inside Playwright's output dir (gitignored) and on
  // the HTML report instead of dropping a stray PNG at the repo root.
  const screenshotPath = testInfo.outputPath('mobile-homepage-final.png');
  await page.screenshot({ path: screenshotPath, fullPage: true, type: 'png' });
  await testInfo.attach('mobile-homepage-final', { path: screenshotPath, contentType: 'image/png' });
});

test('small phones reach the projects without clipping or crowding the actions', async ({ page }) => {
  for (const width of [320, 360, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const actions = page.locator('.hero-actions');
    const box = await actions.boundingBox();
    expect(box!.y + box!.height).toBeLessThan(844);
    for (const link of await actions.getByRole('link').all()) {
      const target = await link.boundingBox();
      expect(target!.height).toBeGreaterThanOrEqual(44);
    }

    const study = page.locator('#projects [data-project-entry]').first();
    const heading = await study.getByRole('heading').boundingBox();
    const drawing = await study.locator('.detail-drawing').boundingBox();
    expect(heading!.y).toBeLessThan(drawing!.y);
  }
});

test('mobile nav panel is compact', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await expect(page.locator('#mobile-nav')).toBeVisible();

  const navHeight = await page.locator('#mobile-nav').evaluate((el) => el.getBoundingClientRect().height);
  console.log('Mobile nav panel height:', navHeight);

  // Five section anchors plus the KanterLabs GitHub link, 44px each.
  expect(navHeight).toBeLessThan(340);
});

test('mobile case study pages layout', async ({ page }) => {
  const pages = [
    ['/projects/helm', 'Helm'],
    ['/projects/multi-node-portfolio', 'Coolify Portfolio Deployment'],
    ['/projects/kanterlabs-homelab', 'KanterLabs Homelab Platform'],
    ['/projects/data-center-operations', 'InterServer Data Center Operations'],
  ] as const;

  for (const [path, heading] of pages) {
    await page.goto(path);

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);

    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expect(page.getByText('Role').first()).toBeVisible();

    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    console.log(`${path} mobile scrollHeight:`, scrollHeight);
  }
});
