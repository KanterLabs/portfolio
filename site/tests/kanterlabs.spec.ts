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

// Helm is the lead project, so it always comes first.
const FLAGSHIPS = ['helm', 'ActionView', 'nfl-scores', 'zeusos', 'greenlit-app'];

async function kanterLabsHrefs(page: Page): Promise<string[]> {
  return page.$$eval('a[href*="github.com/KanterLabs"]', (links) =>
    links.map((link) => (link as HTMLAnchorElement).href),
  );
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/kanterlabs');
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

test.describe('KanterLabs catalog', () => {
  test('the rack mounts the flagships first, then the full public catalog', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/kanterlabs');

    const rack = page.locator('#kanterlabs');
    await expect(rack.locator('figcaption')).toContainText('rack SK-01');

    const units = rack.locator('.rack-row[data-lab-repo]');
    const slugs = await units.evaluateAll((els) => els.map((el) => el.getAttribute('data-lab-repo')!));
    expect(slugs.slice(0, FLAGSHIPS.length)).toEqual(FLAGSHIPS);
    expect(slugs).toHaveLength(FLAGSHIPS.length + 4);
    expect(new Set(slugs).size, 'no repository is mounted twice').toBe(slugs.length);

    // Flagships are taller units than the rest of the catalog.
    for (const slug of slugs) {
      const units = await rack
        .locator(`.rack-row[data-lab-repo="${slug}"]`)
        .evaluate((el) => Number(getComputedStyle(el).getPropertyValue('--units')));
      expect(units, `${slug} height`).toBe(slug === 'helm' ? 4 : FLAGSHIPS.includes(slug) ? 2 : 1);
    }

    // Each unit's link resolves to that repository on the org (Helm opens its
    // case study, which links the repo in turn).
    for (const slug of slugs) {
      const href = await rack.locator(`.rack-row[data-lab-repo="${slug}"] a.rack-link`).getAttribute('href');
      expect(href).toBe(slug === 'helm' ? '/projects/helm' : `${ORG_URL}/${slug}`);
    }

    await expectNoHorizontalOverflow(page);
  });

  test('every flagship gets a plate with real media', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/kanterlabs');

    const plates = page.locator('#plates .plate');
    expect(await plates.evaluateAll((els) => els.map((el) => el.getAttribute('data-lab-repo')))).toEqual(FLAGSHIPS);
    for (let i = 0; i < FLAGSHIPS.length; i += 1) {
      const plate = plates.nth(i);
      const media = plate.locator('.lab-media');
      await expect(media).toHaveCount(1);
      expect((await media.boundingBox())!.height, `${FLAGSHIPS[i]} media height`).toBeGreaterThan(120);
      await expect(plate.getByRole('heading').getByRole('link')).toHaveAttribute('href', `${ORG_URL}/${FLAGSHIPS[i]}`);

      const chrome = await plate.evaluate((el) => {
        const style = getComputedStyle(el);
        return { border: parseFloat(style.borderTopWidth), background: style.backgroundColor };
      });
      expect(chrome.border, `${FLAGSHIPS[i]} plate border`).toBeGreaterThanOrEqual(1);
      expect(chrome.background, `${FLAGSHIPS[i]} plate background`).not.toBe('rgba(0, 0, 0, 0)');
    }
    await expect(page.locator('#plates [data-lab-repo="helm"]').getByRole('link', { name: 'Case study' })).toHaveAttribute(
      'href',
      '/projects/helm',
    );
  });

  test('the lead plate spans the sheet and the rest pair up on desktop', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Single column on phones');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/kanterlabs');

    const boxes = await page.locator('#plates .plate').evaluateAll((els) =>
      els.map((el) => {
        const rect = el.getBoundingClientRect();
        return { top: Math.round(rect.top), width: Math.round(rect.width) };
      }),
    );
    const [lead, ...rest] = boxes;
    expect(lead.width).toBeGreaterThan(rest[0].width * 1.8);
    expect(new Set(rest.map((box) => box.width)).size).toBe(1);
    expect(new Set(rest.map((box) => box.top)).size).toBe(Math.ceil(rest.length / 2));
  });

  test('the site never links a private KanterLabs repository', async ({ page }) => {
    await page.goto('/kanterlabs');
    const publicSlugs = await page
      .locator('#kanterlabs [data-lab-repo]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-lab-repo')!));

    for (const route of [
      '/',
      '/kanterlabs',
      '/projects',
      '/projects/helm',
      '/projects/kanterlabs-homelab',
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

  test('KanterLabs is reachable from the nav, footer, and homepage contact', async ({ page, isMobile }) => {
    await page.goto('/');
    if (isMobile) {
      await page.getByRole('button', { name: 'Toggle navigation' }).click();
      await expect(page.locator('#mobile-nav').getByRole('link', { name: 'KanterLabs', exact: true })).toHaveAttribute(
        'href',
        '/kanterlabs',
      );
    } else {
      await expect(
        page.locator('nav[aria-label="Primary"]').getByRole('link', { name: 'KanterLabs', exact: true }),
      ).toHaveAttribute('href', '/kanterlabs');
    }

    for (const route of ['/', '/kanterlabs', '/projects/helm']) {
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
    await expect(page.locator('.case-lab-cta').getByRole('link', { name: 'Explore KanterLabs products' })).toHaveAttribute(
      'href',
      '/kanterlabs',
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
    await page.goto('/kanterlabs');
    const video = page.locator('[data-lab-video]');
    await video.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    expect(await video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
    await expect(video).toHaveAttribute('poster', /nfl-touchdown-poster/);
  });
});

for (const theme of ['light', 'dark'] as const) {
  test.describe(`KanterLabs catalog in the ${theme} theme`, () => {
    test('theme-matched artwork shows exactly one variant', async ({ page }) => {
      await setTheme(page, theme);
      const card = page.locator('#plates [data-lab-repo="helm"]');
      await expect(card.locator(`.lab-themed-${theme}`)).toBeVisible();
      await expect(card.locator(`.lab-themed-${theme === 'light' ? 'dark' : 'light'}`)).toBeHidden();
    });

    test('rack annotations, plate copy, and drawing labels meet AA contrast', async ({ page }) => {
      await setTheme(page, theme);

      for (const [route, selectors] of [
        ['/kanterlabs', [
          '.rack-rail span',
          '.rack-name',
          '.rack-code',
          '.rack-note',
          '.rack-lcd',
          '.rack-legend',
          '.plate-meta',
          '.detail-summary',
          '.kl-header-sub',
        ]],
        ['/', ['.hero-facts dt', '.hero-facts dd', '.detail-summary', '.title-block dt']],
        ['/projects', ['.dd-node-label', '.dd-node-detail', '.dd-caption']],
      ] as const) {
        await page.goto(route);
        for (const selector of selectors) {
          const color = await page.locator(selector).first().evaluate((el) => getComputedStyle(el).color);
          const parsed = parseColor(color);
          expect(parsed, `unparseable ${selector} color ${color}`).not.toBeNull();
          const bg = await effectiveBackground(page, selector);
          const fg = composite(parsed!.rgb, parsed!.alpha, bg);
          const ratio = getContrastRatio(fg, bg);
          expect(ratio, `${route} ${selector} is ${ratio.toFixed(2)}:1 in ${theme}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
  });
}
