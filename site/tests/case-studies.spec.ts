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

  test('metadata row has no decorative empty spans and CSS-generated separators', async ({ page }) => {
    await page.goto('/projects/hostlet');

    const items = page.locator('.case-meta > *');
    await expect(items).toHaveCount(4);

    const texts = await items.evaluateAll((els) => els.map((el) => (el.textContent ?? '').trim()));
    for (const text of texts) {
      expect(text.length, `case-meta item "${text}" must not be empty`).toBeGreaterThan(0);
    }

    const secondBeforeContent = await items.nth(1).evaluate((el) => getComputedStyle(el, '::before').content);
    expect(secondBeforeContent).toBe('"·"');
  });

  test('the stack row renders middot separators between entries', async ({ page }) => {
    await page.goto('/projects/hostlet');

    const stackItems = page.locator('.stack-list > *');
    const count = await stackItems.count();
    expect(count).toBeGreaterThan(1);

    const separatorContent = await stackItems.nth(1).evaluate((el) => getComputedStyle(el, '::before').content);
    expect(separatorContent).toBe('"·"');
  });

  test('.case-body divider gap is a divider, not another section', async ({ page, isMobile }) => {
    test.skip(isMobile, 'viewport-resizing test drives its own widths');

    for (const { width, expectedPadding } of [
      { width: 1440, expectedPadding: 40 },
      { width: 390, expectedPadding: 28 },
    ]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/projects/hostlet');

      const caseBody = page.locator('.case-body');
      const { paddingTop, marginTop } = await caseBody.evaluate((el) => {
        const style = getComputedStyle(el);
        return { paddingTop: parseFloat(style.paddingTop), marginTop: parseFloat(style.marginTop) };
      });

      expect(paddingTop, `.case-body padding-top at ${width}px`).toBe(expectedPadding);
      expect(paddingTop, `.case-body padding-top < margin-top at ${width}px`).toBeLessThan(marginTop);
    }
  });

  test('the TOC rail has a left border and the active link carries an accent marker', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'The sidebar TOC only exists at >=960px');
    await page.goto('/projects/kanterlabs-homelab');

    const rail = page.locator('.toc-sidebar nav ul');
    await expect(rail).toBeVisible();
    const borderLeftWidth = await rail.evaluate((el) => parseFloat(getComputedStyle(el).borderLeftWidth));
    expect(borderLeftWidth).toBeGreaterThanOrEqual(1);

    // Scroll to force a heading into view so the IntersectionObserver marks
    // a link active.
    await page.locator('.prose h2').nth(1).scrollIntoViewIfNeeded();
    const activeLink = page.locator('.toc-link-active');
    await expect(activeLink).toHaveCount(1, { timeout: 5000 });
    const activeShadow = await activeLink.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(activeShadow).not.toBe('none');

    // Hover a link that is not the active one — the active tint would mask
    // the hover background.
    const hoverLink = page.locator('.toc-link:not(.toc-link-active)').last();
    const beforeBg = await hoverLink.evaluate((el) => getComputedStyle(el).backgroundColor);
    await hoverLink.hover();
    await expect(async () => {
      const afterBg = await hoverLink.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(afterBg).not.toBe(beforeBg);
      expect(afterBg).not.toBe('rgba(0, 0, 0, 0)');
      expect(afterBg).not.toBe('transparent');
    }).toPass({ timeout: 2000 });
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
