import { test, expect } from '@playwright/test';

const caseStudies = [
  {
    path: '/projects/multi-node-portfolio',
    title: 'Portfolio Infrastructure Deployment | Shane Kanterman',
    heading: 'Portfolio Infrastructure Deployment',
  },
  {
    path: '/projects/self-hosted-dev-server',
    title: 'Self-Hosted Linux Server | Shane Kanterman',
    heading: 'Self-Hosted Linux Server',
  },
  {
    path: '/projects/data-center-operations',
    title: 'InterServer Data Center Operations | Shane Kanterman',
    heading: 'InterServer Data Center Operations',
  },
];

test.describe('case studies', () => {
  for (const entry of caseStudies) {
    test(`renders ${entry.path}`, async ({ page }) => {
      await page.goto(entry.path);

      await expect(page).toHaveTitle(entry.title);
      await expect(page.getByRole('heading', { level: 1, name: entry.heading })).toBeVisible();
      await expect(page.getByText('Role').first()).toBeVisible();
      await expect(page.getByText('Scope').first()).toBeVisible();
      await expect(page.getByText('Outcome').first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'Back to all projects' })).toHaveAttribute('href', '/#projects');
    });
  }

  test('featured case study repo link is correct', async ({ page }) => {
    await page.goto('/projects/multi-node-portfolio');

    await expect(page.getByRole('link', { name: 'View portfolio repo' })).toHaveAttribute(
      'href',
      'https://github.com/ShaneKanterman04/portfolio',
    );
    await expect(page.getByText(/Build (\d{2}-\d{2}-\d{4}-\d+|unavailable)/)).toBeVisible();
  });

  test('back to all projects returns to homepage projects anchor', async ({ page }) => {
    await page.goto('/projects/self-hosted-dev-server');
    await page.getByRole('link', { name: 'Back to all projects' }).click();

    await expect
      .poll(async () => page.evaluate(() => window.location.hash))
      .toBe('#projects');
    await expect(page).toHaveURL(/#projects$/);
  });
});
