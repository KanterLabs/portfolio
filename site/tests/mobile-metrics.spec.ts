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
    heroParagraph: document.querySelector('main section > div p:last-of-type')?.textContent?.replace(/\s+/g, ' ').trim(),
    contactLine: Array.from(document.querySelectorAll('p'))
      .find((p) => p.textContent?.includes('shanekanterman04@gmail.com'))
      ?.textContent?.trim(),
    sectionTops: ['projects', 'about', 'architecture', 'skills', 'contact'].map((id) => ({
      id,
      top: Math.round(
        (document.getElementById(id)?.getBoundingClientRect().top ?? 0) + window.scrollY,
      ),
    })),
  }));

  console.log('Mobile metrics:', JSON.stringify(metrics, null, 2));

  expect(metrics.hasHorizontalOverflow).toBe(false);
  expect(metrics.scrollHeight).toBeLessThan(12000);
  expect(metrics.h1).toContain('Building Linux platforms and deployment tooling');
  expect(metrics.heroParagraph).toContain('current InterServer Data Center Technician');
  expect(metrics.contactLine).toContain('shanekanterman04@gmail.com');
  expect(metrics.contactLine).toContain('Cranford');
  expect(metrics.sectionTops[0]?.id).toBe('projects');
  expect(metrics.sectionTops[0]?.top).toBeLessThan(1800);
  expect(metrics.sectionTops[0]?.top).toBeLessThan(metrics.sectionTops[1]?.top ?? 0);

  // Keep the capture inside Playwright's output dir (gitignored) and on
  // the HTML report instead of dropping a stray PNG at the repo root.
  const screenshotPath = testInfo.outputPath('mobile-homepage-final.png');
  await page.screenshot({ path: screenshotPath, fullPage: true, type: 'png' });
  await testInfo.attach('mobile-homepage-final', { path: screenshotPath, contentType: 'image/png' });
});

test('mobile nav panel is compact', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await expect(page.locator('#mobile-nav')).toBeVisible();

  const navHeight = await page.locator('#mobile-nav').evaluate((el) => el.getBoundingClientRect().height);
  console.log('Mobile nav panel height:', navHeight);

  expect(navHeight).toBeLessThan(260);
});

test('mobile case study pages layout', async ({ page }) => {
  const pages = [
    ['/projects/multi-node-portfolio', 'Portfolio Infrastructure Deployment'],
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
