import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('mobile homepage metrics and content spot checks', async ({ page }) => {
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
    sectionTops: ['about', 'architecture', 'projects', 'skills', 'contact'].map((id) => ({
      id,
      top: Math.round(
        (document.getElementById(id)?.getBoundingClientRect().top ?? 0) + window.scrollY,
      ),
    })),
  }));

  console.log('Mobile metrics:', JSON.stringify(metrics, null, 2));

  expect(metrics.hasHorizontalOverflow).toBe(false);
  expect(metrics.scrollHeight).toBeLessThan(12000);
  expect(metrics.h1).toContain('Building software with infrastructure discipline');
  expect(metrics.heroParagraph).toContain('building software with an infrastructure mindset');
  expect(metrics.contactLine).toContain('shanekanterman04@gmail.com');
  expect(metrics.contactLine).toContain('Cranford');

  await page.screenshot({ path: 'mobile-homepage-final.png', fullPage: true, type: 'png' });
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
    ['/projects/self-hosted-dev-server', 'Self-Hosted Linux Server'],
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
