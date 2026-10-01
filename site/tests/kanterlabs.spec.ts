import { test, expect, type Page } from '@playwright/test';
import { composite, effectiveBackground, getContrastRatio, parseColor } from './helpers/contrast';
import { expectNoHorizontalOverflow } from './helpers/navigation';

const ORG_URL = 'https://github.com/KanterLabs';

// Private KanterLabs repositories. None of these may ever be linked from the
// public site — a link would either 404 for visitors or disclose a repo that
// is deliberately unpublished. Keep in sync with the org's private repo list.
const PRIVATE_REPOS = [
  'hostlet',
  'hostlet-cloud',
  'hostlet-tools',
  'hostlet-fixture-v1',
  'infrastructure',
  'sandbox-factory',
  'data_center_tycoon',
  'wildlife-simulation',
  'homebase',
  'flight-tracker',
  'cpp-forge',
  'voxel',
  'hourglass-trader',
  'stashlet',
  'atlas',
  'samesky',
  'last-hearth',
];

const FLAGSHIPS = ['hostlet-core', 'helm', 'ActionView', 'nfl-scores', 'zeusos', 'greenlit-app'];

async function kanterLabsHrefs(page: Page): Promise<string[]> {
  return page.$$eval('a[href*="github.com/KanterLabs"]', (links) =>
    links.map((link) => (link as HTMLAnchorElement).href),
  );
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

test.describe('KanterLabs on the homepage', () => {
  test('studio banner, flagships, and full public catalog render', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const section = page.locator('#kanterlabs');
    await expect(
      section.getByRole('heading', { level: 2, name: 'Everything I build ships from KanterLabs.' }),
    ).toBeVisible();

    const follow = section.getByRole('link', { name: 'Follow KanterLabs on GitHub' });
    await expect(follow).toHaveAttribute('href', ORG_URL);
    await expect(follow).toHaveAttribute('target', '_blank');
    await expect(follow).toHaveAttribute('rel', /noopener/);

    const flagships = section.locator('.lab-feature');
    await expect(flagships).toHaveCount(FLAGSHIPS.length);
    expect(await flagships.evaluateAll((els) => els.map((el) => el.getAttribute('data-lab-repo')))).toEqual(
      FLAGSHIPS,
    );
    // Every flagship leads with real media (screenshot, artwork, video, or a
    // terminal), never an empty frame.
    for (let i = 0; i < FLAGSHIPS.length; i += 1) {
      const media = flagships.nth(i).locator('.lab-media');
      await expect(media).toHaveCount(1);
      const box = await media.boundingBox();
      expect(box!.height, `${FLAGSHIPS[i]} media height`).toBeGreaterThan(120);
    }

    const catalog = section.locator('.lab-repo');
    await expect(catalog).toHaveCount(9);

    // The stated count is derived from the catalog, so it can't drift.
    const total = await section.locator('[data-lab-repo]').count();
    await expect(section.locator('.lab-stats')).toContainText(String(total));
    await expect(page.locator('#top')).toContainText(`${total} repos`);

    // Each card's repo link resolves to that repository on the org.
    const slugs = await section
      .locator('[data-lab-repo]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-lab-repo')!));
    for (const slug of slugs) {
      const card = section.locator(`[data-lab-repo="${slug}"]`);
      await expect(card.getByRole('heading').getByRole('link')).toHaveAttribute('href', `${ORG_URL}/${slug}`);
    }

    await expectNoHorizontalOverflow(page);
  });

  test('cards use the site panel language, not flat text', async ({ page }) => {
    await page.goto('/');

    for (const selector of ['.lab-banner', '.lab-feature', '.lab-repo']) {
      const chrome = await page.locator(selector).first().evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          border: parseFloat(style.borderTopWidth),
          radius: parseFloat(style.borderTopLeftRadius),
          background: style.backgroundColor,
        };
      });
      expect(chrome.border, `${selector} border`).toBeGreaterThanOrEqual(1);
      expect(chrome.radius, `${selector} radius`).toBeGreaterThanOrEqual(12);
      expect(chrome.background, `${selector} background`).not.toBe('rgba(0, 0, 0, 0)');
    }
  });

  test('flagship cards line up in a grid on desktop', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Single column on phones');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const boxes = await page.locator('.lab-feature').evaluateAll((els) =>
      els.map((el) => {
        const rect = el.getBoundingClientRect();
        return { top: Math.round(rect.top), width: Math.round(rect.width) };
      }),
    );
    // 1440px desktop: three per row, equal widths, two rows.
    expect(new Set(boxes.map((box) => box.top)).size).toBe(2);
    expect(new Set(boxes.map((box) => box.width)).size).toBe(1);
  });

  test('the site never links a private KanterLabs repository', async ({ page }) => {
    await page.goto('/');
    const publicSlugs = await page
      .locator('#kanterlabs [data-lab-repo]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-lab-repo')!));

    for (const route of [
      '/',
      '/projects/kanterlabs-homelab',
      '/projects/hostlet',
      '/projects/sandbox-factory',
      '/projects/multi-node-portfolio',
      '/projects/data-center-operations',
      '/404',
    ]) {
      await page.goto(route);
      for (const href of await kanterLabsHrefs(page)) {
        const slug = new URL(href).pathname.split('/')[2];
        if (!slug) continue; // the org root
        expect(PRIVATE_REPOS, `${route} links private repo ${href}`).not.toContain(slug);
        expect(publicSlugs, `${route} links ${href}, which is not in the public catalog`).toContain(slug);
      }
    }
  });

  test('KanterLabs is reachable from the nav, footer, and contact on every page', async ({ page, isMobile }) => {
    await page.goto('/');
    if (isMobile) {
      await page.getByRole('button', { name: 'Toggle navigation' }).click();
      await expect(page.locator('#mobile-nav').getByRole('link', { name: 'KanterLabs on GitHub' })).toHaveAttribute(
        'href',
        ORG_URL,
      );
    } else {
      await expect(
        page.locator('nav[aria-label="Primary"]').getByRole('link', { name: 'KanterLabs on GitHub' }),
      ).toHaveAttribute('href', ORG_URL);
    }

    for (const route of ['/', '/projects/hostlet']) {
      await page.goto(route);
      const footer = page.getByLabel('Site footer');
      await expect(footer.getByRole('link', { name: 'GitHub', exact: true })).toHaveAttribute('href', ORG_URL);
      await expect(footer.getByRole('link', { name: 'Site source' })).toHaveAttribute('href', `${ORG_URL}/portfolio`);
    }

    await page.goto('/');
    await expect(page.locator('#contact').getByRole('link', { name: 'KanterLabs on GitHub' })).toHaveAttribute(
      'href',
      ORG_URL,
    );

    await page.goto('/projects/kanterlabs-homelab');
    await expect(page.locator('.case-lab-cta').getByRole('link', { name: 'KanterLabs on GitHub' })).toHaveAttribute(
      'href',
      ORG_URL,
    );
  });

  test('structured data names KanterLabs and its founder', async ({ page }) => {
    await page.goto('/');
    const blocks = await page.$$eval('script[type="application/ld+json"]', (scripts) =>
      scripts.map((script) => JSON.parse(script.textContent ?? '{}')),
    );
    const org = blocks.find((block) => block['@type'] === 'Organization');
    expect(org?.name).toBe('KanterLabs');
    expect(org?.url).toBe(ORG_URL);
    expect(org?.founder?.name).toBe('Shane Kanterman');
    const person = blocks.find((block) => block['@type'] === 'Person');
    expect(person?.sameAs).toContain(ORG_URL);
  });

  test('the gamecast video stays paused under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const video = page.locator('[data-lab-video]');
    await video.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    expect(await video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
    await expect(video).toHaveAttribute('poster', /nfl-touchdown-poster/);
  });
});

for (const theme of ['light', 'dark'] as const) {
  test.describe(`KanterLabs section in the ${theme} theme`, () => {
    test('theme-matched artwork shows exactly one variant', async ({ page }) => {
      await setTheme(page, theme);
      const card = page.locator('[data-lab-repo="helm"]');
      await expect(card.locator(`.lab-themed-${theme}`)).toBeVisible();
      await expect(card.locator(`.lab-themed-${theme === 'light' ? 'dark' : 'light'}`)).toBeHidden();
    });

    test('status chips, summaries, and stat labels meet AA contrast', async ({ page }) => {
      await setTheme(page, theme);

      for (const selector of [
        '.lab-feature .lab-status',
        '.lab-repo .lab-status',
        '.lab-card-summary',
        '.lab-repo-footer',
        '.lab-stats dt',
        '.lab-wordmark-accent',
        '.kl-header-sub',
      ]) {
        const color = await page.locator(selector).first().evaluate((el) => getComputedStyle(el).color);
        const parsed = parseColor(color);
        expect(parsed, `unparseable ${selector} color ${color}`).not.toBeNull();
        const bg = await effectiveBackground(page, selector);
        const fg = composite(parsed!.rgb, parsed!.alpha, bg);
        const ratio = getContrastRatio(fg, bg);
        expect(ratio, `${selector} is ${ratio.toFixed(2)}:1 in ${theme}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
}
