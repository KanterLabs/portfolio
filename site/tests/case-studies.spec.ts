import { test, expect } from '@playwright/test';

const caseStudies = [
  {
    path: '/projects/multi-node-portfolio',
    title: 'Portfolio Infrastructure Deployment | Shane Kanterman',
    heading: 'Portfolio Infrastructure Deployment',
    backLabel: 'Back to selected work',
    backHref: '/#projects',
  },
  {
    path: '/projects/kanterlabs-homelab',
    title: 'KanterLabs Homelab Platform | Shane Kanterman',
    heading: 'KanterLabs Homelab Platform',
    backLabel: 'Back to selected work',
    backHref: '/#projects',
  },
  {
    path: '/projects/hostlet',
    title: 'Hostlet Self-Hosted Deployment Panel | Shane Kanterman',
    heading: 'Hostlet Self-Hosted Deployment Panel',
    backLabel: 'Back to selected work',
    backHref: '/#projects',
  },
  {
    path: '/projects/data-center-operations',
    title: 'InterServer Data Center Operations | Shane Kanterman',
    heading: 'InterServer Data Center Operations',
    backLabel: 'Back to experience',
    backHref: '/#about',
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
      await expect(page.getByRole('link', { name: entry.backLabel })).toHaveAttribute(
        'href',
        entry.backHref,
      );
    });
  }

  test('featured case study source link is correct', async ({ page }) => {
    await page.goto('/projects/kanterlabs-homelab');

    await expect(page.getByRole('link', { name: 'View portfolio source' })).toHaveAttribute(
      'href',
      'https://github.com/KanterLabs/portfolio',
    );
    await expect(page.getByText(/Build (\d{2}-\d{2}-\d{4}-\d+|unavailable)/)).toBeVisible();
  });

  test('back to selected work returns to homepage projects anchor', async ({ page }) => {
    await page.goto('/projects/kanterlabs-homelab');
    await page.getByRole('link', { name: 'Back to selected work' }).click();

    await expect
      .poll(async () => page.evaluate(() => window.location.hash))
      .toBe('#projects');
    await expect(page).toHaveURL(/#projects$/);
  });

  test('project source links use canonical repositories', async ({ page }) => {
    await page.goto('/projects/hostlet');
    await expect(page.getByRole('link', { name: 'View Hostlet repo' })).toHaveAttribute(
      'href',
      'https://github.com/KanterLabs/hostlet-core',
    );

    await page.goto('/projects/multi-node-portfolio');
    await expect(page.getByRole('link', { name: 'View portfolio repo' })).toHaveAttribute(
      'href',
      'https://github.com/KanterLabs/portfolio',
    );
  });

  test('data center experience reflects current employment', async ({ page }) => {
    await page.goto('/projects/data-center-operations');

    await expect(page.getByText('Experience Notes')).toBeVisible();
    await expect(page.getByText(/since June 2025/)).toBeVisible();
    await expect(page.getByText(/June through August 2025/)).toHaveCount(0);
  });

  test('legacy homelab route redirects to the new case study', async ({ page }) => {
    await page.goto('/projects/self-hosted-dev-server');

    await expect(page).toHaveURL(/\/projects\/kanterlabs-homelab\/?$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'KanterLabs Homelab Platform' }),
    ).toBeVisible();
  });

  test('heading anchors are keyboard reachable and reveal on focus', async ({ page }) => {
    await page.goto('/projects/kanterlabs-homelab');

    const anchor = page.locator('.prose h2 > .heading-anchor').first();
    await anchor.focus();
    await expect(anchor).toBeFocused();
    // The anchor is hidden until hovered or focused.
    await expect.poll(() => anchor.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');

    const href = await anchor.getAttribute('href');
    expect(href).toMatch(/^#.+/);
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(href);
  });

  test('TOC links target real heading ids', async ({ page }) => {
    await page.goto('/projects/kanterlabs-homelab');

    const hrefs = await page
      .locator('.toc-sidebar a.toc-link, [data-toc-details] nav a')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
    expect(hrefs.length).toBeGreaterThan(0);

    for (const href of hrefs) {
      expect(href).toMatch(/^#.+/);
      await expect(page.locator(`[id="${href.slice(1)}"]`)).toHaveCount(1);
    }
  });

  test('homelab diagrams expand and close from the keyboard', async ({ page }) => {
    await page.goto('/projects/kanterlabs-homelab');

    const trigger = page.getByRole('button', { name: /Expand diagram:/ }).first();
    await trigger.click();

    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  test('public case-study assets do not expose private network identifiers', async ({
    page,
    request,
  }) => {
    await page.goto('/projects/kanterlabs-homelab');
    const renderedText = await page.locator('main').innerText();
    const assetPaths = [
      '/diagrams/homelab-estate.svg',
      '/diagrams/repository-control-map.svg',
      '/diagrams/homelab-trust-zones.svg',
      '/diagrams/runner-lifecycle.svg',
      '/diagrams/architecture-diagram.svg',
    ];
    const assetText = (
      await Promise.all(
        assetPaths.map(async (path) => {
          const response = await request.get(path);
          expect(response.ok()).toBe(true);
          return response.text();
        }),
      )
    ).join('\n');
    const publicContent = `${renderedText}\n${assetText}`;

    expect(publicContent).not.toMatch(/\b10\.(?:\d{1,3}\.){2}\d{1,3}\b/);
    expect(publicContent).not.toMatch(/\b100\.(?:\d{1,3}\.){2}\d{1,3}\b/);
    expect(publicContent).not.toMatch(/\btail[a-z0-9]+\.ts\.net\b/i);
    expect(publicContent).not.toMatch(/\b(?:VM|LXC)\s+\d{2,3}\b/);
    expect(publicContent).not.toContain('kanter-edge');
  });
});
