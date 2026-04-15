import { test, expect } from '@playwright/test';
import { expectHashLinkToReachSection, expectNoHorizontalOverflow } from './helpers/navigation';

test.describe('homepage', () => {
  test('desktop nav anchors and CTA targets work', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop-only anchor validation');

    await page.goto('/');
    const primaryNav = page.locator('nav[aria-label="Primary"]');

    await expect(page).toHaveTitle('Shane Kanterman | Linux Infrastructure and Web Projects');
    await expect(page.getByRole('heading', { name: 'Building Linux infrastructure and web projects with deployment discipline.' })).toBeVisible();

    await expectHashLinkToReachSection(page, () => primaryNav.getByRole('link', { name: 'About' }).click(), 'about');
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
      maxTop: 420,
    });
    await page.goto('/');
    await expectHashLinkToReachSection(
      page,
      () => page.getByRole('link', { name: 'View Case Studies' }).click(),
      'projects',
    );

    await expect(page.getByRole('link', { name: 'Resume' }).first()).toHaveAttribute('href', '/Kanterman_Resume.pdf');
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
      'Portfolio site for Shane Kanterman featuring Linux infrastructure, cloud deployment, and web projects built with practical operations experience.',
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
});
