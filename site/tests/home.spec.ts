import { test, expect } from '@playwright/test';
import { expectHashLinkToReachSection, expectNoHorizontalOverflow } from './helpers/navigation';

test.describe('homepage', () => {
  test('desktop nav anchors and CTA targets work', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop-only anchor validation');

    await page.goto('/');
    const primaryNav = page.locator('nav[aria-label="Primary"]');

    await expect(page).toHaveTitle('Shane Kanterman | Infrastructure and Platform Projects');
    await expect(
      page.getByRole('heading', {
        name: 'Building Linux platforms and deployment tooling—from bare metal to CI/CD.',
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 3, name: 'KanterLabs Homelab Platform' }),
    ).toBeVisible();
    await expect(page.getByText('Featured case study')).toBeVisible();

    await expectHashLinkToReachSection(page, () => primaryNav.getByRole('link', { name: 'Experience' }).click(), 'about');
    await page.goto('/');
    await expectHashLinkToReachSection(
      page,
      () => primaryNav.getByRole('link', { name: 'Architecture' }).click(),
      'architecture',
    );
    await page.goto('/');
    await expectHashLinkToReachSection(page, () => primaryNav.getByRole('link', { name: 'Projects' }).click(), 'projects');
    await page.goto('/');
    await expectHashLinkToReachSection(page, () => primaryNav.getByRole('link', { name: 'Skills' }).click(), 'skills');
    await page.goto('/');
    await expectHashLinkToReachSection(page, () => primaryNav.getByRole('link', { name: 'Contact' }).click(), 'contact', {
      maxTop: 460,
    });
    await page.goto('/');
    await expectHashLinkToReachSection(
      page,
      () => page.getByRole('link', { name: 'View Selected Work' }).click(),
      'projects',
    );

    await expect(page.getByRole('link', { name: 'Resume' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'LinkedIn' }).first()).toHaveAttribute(
      'href',
      'https://www.linkedin.com/in/shane-kanterman-4511a2234',
    );
    await expect(page.getByRole('link', { name: 'GitHub' }).first()).toHaveAttribute(
      'href',
      'https://github.com/ShaneKanterman04',
    );
    await expect(page.getByRole('link', { name: 'Email me' })).toHaveAttribute(
      'href',
      'mailto:shanekanterman04@gmail.com',
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://shanekanterman.dev/');
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      'Infrastructure and platform portfolio for Shane Kanterman featuring Linux systems, deployment tooling, ephemeral CI, and hands-on data center operations.',
    );

    await expect(page.getByLabel('Site footer')).toContainText('Build');
    await expect(page.getByText(/Build (\d{2}-\d{2}-\d{4}-\d+|unavailable)/)).toBeVisible();
  });

  test('mobile menu works and layout does not overflow', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile-only layout validation');

    await page.goto('/');

    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    await expect(page.locator('#mobile-nav')).toBeVisible();
    await expect(page.locator('button[aria-controls="mobile-nav"]')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#mobile-nav')).toContainText('Projects');

    await expectHashLinkToReachSection(
      page,
      () => page.locator('#mobile-nav').getByRole('link', { name: 'Projects' }).click(),
      'projects',
    );
    await expectNoHorizontalOverflow(page);
    await expect(page.getByText(/Build (\d{2}-\d{2}-\d{4}-\d+|unavailable)/)).toBeVisible();
  });

  test('every case-study row after the first has a divider line', async ({ page }) => {
    await page.goto('/');

    const rows = page.locator('#projects .project-row');
    const count = await rows.count();
    expect(count).toBeGreaterThan(2);

    for (let i = 0; i < count; i += 1) {
      const border = await rows.nth(i).evaluate((el) => {
        const style = getComputedStyle(el);
        const alpha = style.borderTopColor.match(/rgba?\(([^)]+)\)/)?.[1].split(',')[3];
        return {
          width: parseFloat(style.borderTopWidth),
          style: style.borderTopStyle,
          alpha: alpha === undefined ? 1 : parseFloat(alpha),
        };
      });

      if (i === 0) continue; // the featured row leads the list, no divider
      expect(border.width, `row ${i} divider width`).toBeGreaterThanOrEqual(1);
      expect(border.style, `row ${i} divider style`).toBe('solid');
      expect(border.alpha, `row ${i} divider visibility`).toBeGreaterThan(0);
    }
  });

  test('case-study titles link to their case studies', async ({ page }) => {
    await page.goto('/');

    const titleLinks = page.locator('.project-row-title a');
    await expect(titleLinks).toHaveCount(3);
    for (const href of await titleLinks.evaluateAll((links) => links.map((l) => l.getAttribute('href')))) {
      expect(href).toMatch(/^\/projects\/.+/);
    }

    await titleLinks.first().click();
    await expect(page).toHaveURL(/\/projects\/kanterlabs-homelab\/?$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'KanterLabs Homelab Platform' }),
    ).toBeVisible();
  });

  test('selected work precedes experience and uses the intended project order', async ({ page }) => {
    await page.goto('/');

    const sectionOrder = await page.locator('main > section').evaluateAll((sections) =>
      sections.map((section) => section.id).filter(Boolean),
    );
    expect(sectionOrder.slice(0, 3)).toEqual(['top', 'projects', 'about']);

    const titles = await page
      .locator('#projects .project-row-title')
      .allTextContents();
    expect(titles.map((title) => title.trim())).toEqual([
      'KanterLabs Homelab Platform',
      'Hostlet Self-Hosted Deployment Panel',
      'Portfolio Infrastructure Deployment',
    ]);

    await expect(page.getByRole('link', { name: 'Read experience notes' })).toHaveAttribute(
      'href',
      '/projects/data-center-operations',
    );
    await expect(page.getByText('June 2025 – Present')).toBeVisible();
  });

  test('featured case study is visually distinct from supporting rows', async ({ page }) => {
    await page.goto('/');

    const featured = page.locator('.project-row-featured');
    await expect(featured).toHaveCount(1);
    await expect(featured.locator('.project-row-outcome')).toBeVisible();

    const accent = await featured.evaluate((el) => {
      const style = getComputedStyle(el);
      return { width: parseFloat(style.borderLeftWidth), style: style.borderLeftStyle };
    });
    expect(accent.width).toBeGreaterThanOrEqual(2);
    expect(accent.style).toBe('solid');

    const featuredTitle = await featured
      .locator('.project-row-title')
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const supportingTitle = await page
      .locator('.project-row:not(.project-row-featured) .project-row-title')
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(featuredTitle).toBeGreaterThan(supportingTitle * 1.2);
  });

  test('theme follows system preference and persists manual selection', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop-only theme validation');

    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const toggle = page.locator('[data-theme-toggle]');
    await expect(toggle).toHaveAttribute('aria-label', 'Switch to dark theme');

    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});
