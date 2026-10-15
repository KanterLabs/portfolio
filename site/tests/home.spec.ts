import { test, expect, type Page } from '@playwright/test';
import { expectHashLinkToReachSection, expectNoHorizontalOverflow } from './helpers/navigation';
import { parseColor, effectiveBackground, getContrastRatio } from './helpers/contrast';

// The public catalog in src/lib/kanterlabs.ts, in order. Restated here rather
// than imported: that module pulls in image assets Playwright can't load.
const CATALOG = [
  ['helm', 'Helm'],
  ['ActionView', 'ActionView'],
  ['nfl-scores', 'NFL Scores'],
  ['zeusos', 'Zeus OS'],
  ['greenlit-app', 'Greenlit'],
  ['linkshare', 'Linkshare'],
  ['ncspot', 'ncspot'],
  ['RunComp', 'RunComp'],
  ['portfolio', 'Portfolio'],
] as const;
const unitHref = (slug: string) => (slug === 'helm' ? '/projects/helm' : `https://github.com/KanterLabs/${slug}`);

const repoRows = (page: Page) => page.locator('#kanterlabs .rack-row[data-lab-repo]');

test.describe('homepage', () => {
  test('desktop nav anchors and CTA targets work', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop-only anchor validation');

    await page.goto('/');
    const primaryNav = page.locator('nav[aria-label="Primary"]');

    await expect(page).toHaveTitle('Shane Kanterman | Data Center Technician and Infrastructure Work');
    await expect(page.getByRole('heading', { level: 1, name: 'Everything I run, in one rack.' })).toBeVisible();

    const sections = [
      ['Rack', 'kanterlabs'],
      ['Case studies', 'projects'],
      ['Experience', 'about'],
      ['Skills', 'skills'],
    ] as const;
    for (const [label, id] of sections) {
      await page.goto('/');
      await expectHashLinkToReachSection(page, () => primaryNav.getByRole('link', { name: label }).click(), id);
    }
    await page.goto('/');
    // The last sheet can't scroll all the way to the top of the viewport.
    await expectHashLinkToReachSection(page, () => primaryNav.getByRole('link', { name: 'Contact' }).click(), 'contact', {
      maxTop: 480,
    });

    await page.goto('/');
    const top = page.locator('#top');
    await expect(top.getByRole('link', { name: /Open detail A: Helm/ })).toHaveAttribute('href', '/projects/helm');
    await expect(top.getByRole('link', { name: 'Data center work' })).toHaveAttribute(
      'href',
      '/projects/data-center-operations',
    );
    await expect(top.locator('.hero-actions').getByRole('link', { name: 'KanterLabs on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/KanterLabs',
    );

    // The site deliberately doesn't publish a résumé.
    await expect(page.getByRole('link', { name: /R[eé]sum[eé]/ })).toHaveCount(0);
    await expect(page.locator('#contact').getByRole('link', { name: 'LinkedIn' })).toHaveAttribute(
      'href',
      'https://www.linkedin.com/in/shane-kanterman-4511a2234',
    );
    await expect(page.locator('#contact').getByRole('link', { name: 'ShaneKanterman04', exact: true })).toHaveAttribute(
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
      'Portfolio of Shane Kanterman, a Data Center Technician at InterServer, featuring production server operations, Linux systems, deployment tooling, and infrastructure projects.',
    );

    await expect(page.getByLabel('Site footer')).toContainText('Build');
    await expect(page.getByText(/Build \d{2}-\d{2}-\d{4} · [0-9a-f]{7}/)).toBeVisible();
  });

  test('mobile menu works and layout does not overflow', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile-only layout validation');

    await page.goto('/');

    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    await expect(page.locator('#mobile-nav')).toBeVisible();
    await expect(page.locator('button[aria-controls="mobile-nav"]')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#mobile-nav')).toContainText('Case studies');

    await expectHashLinkToReachSection(
      page,
      () => page.locator('#mobile-nav').getByRole('link', { name: 'Case studies' }).click(),
      'projects',
    );
    await expectNoHorizontalOverflow(page);
    await expect(page.getByText(/Build \d{2}-\d{2}-\d{4} · [0-9a-f]{7}/)).toBeVisible();
  });

  test('the hero headline holds to two lines on desktop', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The two-line budget is a desktop fold constraint');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const { height, lineHeight } = await page.locator('h1').evaluate((el) => {
      const style = getComputedStyle(el);
      return { height: el.getBoundingClientRect().height, lineHeight: parseFloat(style.lineHeight) };
    });
    expect(height / lineHeight, 'hero h1 line count').toBeLessThanOrEqual(2.3);
  });

  test('sheets are numbered in order and drawn as bordered frames', async ({ page }) => {
    await page.goto('/');
    const sheets = page.locator('main > .sheet');
    const count = await sheets.count();
    expect(count).toBe(6);

    for (let index = 0; index < count; index += 1) {
      const sheet = sheets.nth(index);
      await expect(sheet.locator('.sheet-head .dwg-label').first()).toContainText(
        `SHT ${String(index + 1).padStart(2, '0')} of ${String(count).padStart(2, '0')}`,
      );
      const borderWidth = await sheet.evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth));
      expect(borderWidth, `sheet ${index + 1} border`).toBeGreaterThanOrEqual(1);
    }

    const order = await sheets.evaluateAll((els) =>
      els
        .map((el) => ({ id: el.id, top: el.getBoundingClientRect().top + window.scrollY }))
        .sort((a, b) => a.top - b.top)
        .map((entry) => entry.id),
    );
    expect(order).toEqual(['top', 'projects', 'plates', 'about', 'skills', 'contact']);
  });

  test('the rack mounts every public repository once, in catalog order', async ({ page }) => {
    await page.goto('/');

    const slugs = await repoRows(page).evaluateAll((rows) => rows.map((row) => row.getAttribute('data-lab-repo')));
    expect(slugs).toEqual(CATALOG.map(([slug]) => slug));

    for (const [slug, name] of CATALOG) {
      const row = page.locator(`#kanterlabs .rack-row[data-lab-repo="${slug}"]`);
      const link = row.locator('a.rack-link');
      await expect(link).toHaveCount(1);
      await expect(link).toHaveAttribute('href', unitHref(slug));
      await expect(link).toHaveAccessibleName(new RegExp(`^${name}`));
    }
  });

  test('the elevation adds up: 22U, numbered from the top, lead unit 4U', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Rack geometry is the desktop drawing; phones get the unit list');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const units = await page
      .locator('#kanterlabs .rack-row')
      .evaluateAll((rows) => rows.map((row) => Number(getComputedStyle(row).getPropertyValue('--units'))));
    expect(units.reduce((sum, value) => sum + value, 0)).toBe(22);

    const firstRail = page.locator('#kanterlabs .rack-row').first().locator('.rack-rail').first();
    await expect(firstRail.locator('span').first()).toHaveText('22');
    const lastRail = page.locator('#kanterlabs .rack-row').last().locator('.rack-rail').first();
    await expect(lastRail.locator('span:not(.rack-range)').last()).toHaveText('01');

    const lead = page.locator('#kanterlabs .rack-row[data-kind="lead"]');
    await expect(lead).toHaveAttribute('data-lab-repo', 'helm');
    const oneU = await page.locator('#kanterlabs .rack-row[data-lab-repo="linkshare"]').boundingBox();
    const leadBox = await lead.boundingBox();
    expect(Math.abs(leadBox!.height - oneU!.height * 4)).toBeLessThanOrEqual(1);
    // 1U rows are whole-row link targets: keep them >= 24px (WCAG 2.5.8).
    expect(oneU!.height).toBeGreaterThanOrEqual(24);
  });

  test('callouts sit outside the cabinet, centred on their unit', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Leader lines are a desktop-only treatment');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const cabinetRight = await page.locator('#kanterlabs .rack').evaluate((el) => {
      const before = getComputedStyle(el, '::before');
      return el.getBoundingClientRect().left + parseFloat(before.width);
    });

    const rows = page.locator('#kanterlabs .rack-row:not([data-kind="blank"])');
    const count = await rows.count();
    for (let index = 0; index < count; index += 1) {
      const row = rows.nth(index);
      const face = await row.locator('.rack-face').boundingBox();
      const num = await row.locator('.rack-num').boundingBox();
      const leader = await row.locator('.rack-leader').boundingBox();
      expect(leader!.x, `leader ${index} starts at the cabinet`).toBeGreaterThanOrEqual(cabinetRight - 1);
      expect(
        Math.abs(face!.y + face!.height / 2 - (num!.y + num!.height / 2)),
        `callout ${index} centred on its faceplate`,
      ).toBeLessThanOrEqual(1.5);
    }
  });

  test('the whole unit is clickable, faceplate included', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Pointer hit-testing is checked on the desktop drawing');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const face = await page.locator('#kanterlabs .rack-row[data-lab-repo="greenlit-app"] .rack-face').boundingBox();
    const hitHref = await page.evaluate(
      ({ x, y }) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('a')?.getAttribute('href'),
      { x: face!.x + face!.width / 2, y: face!.y + face!.height / 2 },
    );
    expect(hitHref).toBe('https://github.com/KanterLabs/greenlit-app');
  });

  test('hovering a unit pulls its faceplate, and reduced motion keeps it still', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Hover is a pointer interaction');
    await page.goto('/');

    const row = page.locator('#kanterlabs .rack-row[data-lab-repo="linkshare"]');
    const face = row.locator('.rack-face');
    const before = await face.evaluate((el) => getComputedStyle(el).borderTopColor);
    await row.hover();
    await expect
      .poll(() => face.evaluate((el) => getComputedStyle(el).transform))
      .not.toBe('none');
    await expect.poll(() => face.evaluate((el) => getComputedStyle(el).borderTopColor)).not.toBe(before);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.mouse.move(0, 0);
    await row.hover();
    expect(await face.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
  });

  test('on phones the rack becomes a full-width unit list', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile-only layout');
    await page.goto('/');

    const rack = await page.locator('#kanterlabs .rack').boundingBox();
    const rows = repoRows(page);
    const count = await rows.count();
    for (let index = 0; index < count; index += 1) {
      const row = rows.nth(index);
      const face = await row.locator('.rack-face').boundingBox();
      const note = await row.locator('.rack-note').boundingBox();
      expect(face!.width, `unit ${index} faceplate width`).toBeGreaterThan(rack!.width * 0.7);
      expect(note!.y, `unit ${index} note sits under its faceplate`).toBeGreaterThanOrEqual(face!.y + face!.height - 1);
      expect((await row.boundingBox())!.height, `unit ${index} row target`).toBeGreaterThanOrEqual(44);
      await expect(row.locator('.rack-leader')).toBeHidden();
    }
    await expect(page.locator('#kanterlabs .rack-row[data-kind="blank"]').first()).toBeHidden();
  });

  test('the patch panel and power unit carry contact and experience', async ({ page }) => {
    await page.goto('/');
    const patch = page.locator('#kanterlabs .rack-row[data-kind="patch"]');
    await expect(patch.getByRole('link', { name: 'Email' })).toHaveAttribute('href', 'mailto:shanekanterman04@gmail.com');
    await expect(patch.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute(
      'href',
      'https://www.linkedin.com/in/shane-kanterman-4511a2234',
    );
    await expect(patch.getByRole('link', { name: 'GitHub', exact: true })).toHaveAttribute(
      'href',
      'https://github.com/KanterLabs',
    );
    await expect(patch.getByRole('link', { name: 'Personal GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/ShaneKanterman04',
    );

    const power = page.locator('#kanterlabs .rack-row[data-kind="power"]');
    await expect(power.getByRole('link')).toHaveAttribute('href', '/projects/data-center-operations');
    await expect(power).toContainText('InterServer');
  });

  test('case studies render as detail drawings in project order', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const entries = page.locator('#projects [data-project-entry]');
    await expect(entries).toHaveCount(3);
    const titles = entries.locator('.detail-title a');
    await expect(titles).toHaveText(['Helm', 'KanterLabs Homelab Platform', 'Coolify Portfolio Deployment']);
    expect(await titles.evaluateAll((links) => links.map((link) => link.getAttribute('href')))).toEqual([
      '/projects/helm',
      '/projects/kanterlabs-homelab',
      '/projects/multi-node-portfolio',
    ]);

    for (let index = 0; index < 3; index += 1) {
      const surface = await entries.nth(index).evaluate((el) => {
        const style = getComputedStyle(el);
        return { border: parseFloat(style.borderTopWidth), background: style.backgroundColor };
      });
      expect(surface.border, `entry ${index} border`).toBeGreaterThanOrEqual(1);
      expect(surface.background, `entry ${index} is an opaque surface`).not.toBe('rgba(0, 0, 0, 0)');
    }
  });

  test('detail drawings are honest, captioned, and keep decoration out of the a11y tree', async ({ page }) => {
    await page.goto('/');

    const drawings = page.locator('#projects .detail-drawing');
    await expect(drawings).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) {
      const drawing = drawings.nth(index);
      const caption = (await drawing.locator('figcaption').textContent())?.trim() ?? '';
      expect(caption.length, `drawing ${index} caption`).toBeGreaterThan(20);
      const connectors = drawing.locator('.dd-connector');
      const connectorCount = await connectors.count();
      expect(connectorCount, `drawing ${index} has connectors`).toBeGreaterThan(0);
      for (let c = 0; c < connectorCount; c += 1) {
        await expect(connectors.nth(c)).toHaveAttribute('aria-hidden', 'true');
      }
    }

    // Detail A's accent node is drawn with a hatched frame.
    const accent = page.locator('#detail-a .dd-node-wrap[data-accent]');
    await expect(accent).toHaveCount(1);
    await expect(accent).toContainText('Versioned Go API');
    expect(await accent.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain('repeating-linear-gradient');
  });

  test('plates follow the rack: same order, same callout numbers', async ({ page }) => {
    await page.goto('/');
    const plates = page.locator('#plates .plate');
    const slugs = await plates.evaluateAll((els) => els.map((el) => el.getAttribute('data-lab-repo')));
    expect(slugs).toEqual(['helm', 'ActionView', 'nfl-scores', 'zeusos', 'greenlit-app']);

    for (const slug of slugs) {
      const rackCallout = await page
        .locator(`#kanterlabs .rack-row[data-lab-repo="${slug}"] .rack-num`)
        .textContent();
      await expect(page.locator(`#plates .plate[data-lab-repo="${slug}"] .plate-callout`)).toHaveText(rackCallout!);
      const media = await page.locator(`#plates .plate[data-lab-repo="${slug}"] .plate-media`).boundingBox();
      expect(media!.height, `${slug} plate media`).toBeGreaterThan(120);
    }
  });

  test('experience reads as a revision table with the current role first', async ({ page }) => {
    await page.goto('/');
    const rows = page.locator('#about .revision-table tbody tr');
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText('June 2025 – Present');
    await expect(rows.first()).toContainText('Data Center Technician');
    await expect(rows.first().locator('td').first()).toHaveText('C');
    await expect(page.locator('#about').getByRole('link', { name: /Read experience notes/ })).toHaveAttribute(
      'href',
      '/projects/data-center-operations',
    );
  });

  test('skills read as a bill of materials', async ({ page }) => {
    await page.goto('/');
    const rows = page.locator('#skills .bom-table tbody tr');
    await expect(rows).toHaveCount(3);
    await expect(rows.locator('th[scope="row"]')).toHaveText([
      'Systems and Networking',
      'Platform and Delivery',
      'Software and Data',
    ]);
    for (let index = 0; index < 3; index += 1) {
      expect(await rows.nth(index).locator('.bom-parts li').count()).toBeGreaterThanOrEqual(5);
    }
  });

  test('the contact title block carries every way to reach me', async ({ page }) => {
    await page.goto('/');
    const contact = page.locator('#contact');
    await expect(contact.getByRole('heading', { level: 2 })).toHaveText('Data center and infrastructure roles.');
    await expect(contact.locator('.title-block')).toContainText('Cranford, NJ and New Haven, CT');
    await expect(contact.locator('.title-block').getByRole('link', { name: 'shanekanterman04@gmail.com' })).toHaveAttribute(
      'href',
      'mailto:shanekanterman04@gmail.com',
    );
    await expect(contact.locator('.title-block').getByRole('link', { name: 'KanterLabs' })).toHaveAttribute(
      'href',
      'https://github.com/KanterLabs',
    );
  });

  test('contact email clears contrast in both themes', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop-only contrast check; the copy is unaffected by viewport');

    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      await page.addInitScript(() => localStorage.clear());
      await page.goto('/');
      await page.evaluate(() => localStorage.clear());
      await page.reload();

      const selector = '#contact .title-block a[href^="mailto:"]';
      const bg = await effectiveBackground(page, selector);
      const color = await page.locator(selector).evaluate((el) => getComputedStyle(el).color);
      const fg = parseColor(color);
      expect(fg, `unparseable color ${color} (${colorScheme})`).not.toBeNull();
      const ratio = getContrastRatio(fg!.rgb, bg);
      expect(ratio, `${colorScheme} email contrast: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('theme defaults to system mode and cycles system, light, dark', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop-only theme validation');

    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Fresh visit: system mode, resolved to the OS preference.
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'light');
    await expect(html).toHaveAttribute('data-theme-mode', 'system');
    const toggle = page.locator('[data-theme-toggle]');
    await expect(toggle).toHaveAttribute('aria-label', 'Theme: system. Switch to light theme');

    // System mode tracks OS preference changes live.
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(html).toHaveAttribute('data-theme', 'light');

    // Explicit light: pinned, no longer follows the OS.
    await toggle.click();
    await expect(html).toHaveAttribute('data-theme-mode', 'light');
    await expect(toggle).toHaveAttribute('aria-label', 'Theme: light. Switch to dark theme');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(html).toHaveAttribute('data-theme', 'light');

    // Explicit dark: persists across reloads.
    await toggle.click();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect(html).toHaveAttribute('data-theme-mode', 'dark');
    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect(html).toHaveAttribute('data-theme-mode', 'dark');

    // Third click returns to system mode: storage cleared, OS wins again.
    await toggle.click();
    await expect(html).toHaveAttribute('data-theme-mode', 'system');
    await expect(html).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => localStorage.getItem('portfolio-theme'))).toBeNull();
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(html).toHaveAttribute('data-theme', 'light');
  });
});
