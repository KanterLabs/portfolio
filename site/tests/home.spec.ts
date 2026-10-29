import { test, expect, type Page } from '@playwright/test';
import { expectHashLinkToReachSection, expectNoHorizontalOverflow } from './helpers/navigation';
import { parseColor, effectiveBackground, getContrastRatio } from './helpers/contrast';

test.describe('homepage', () => {
  test('mobile puts proof and experience ahead of the full catalog', async ({ page, isMobile }, testInfo) => {
    test.skip(!isMobile, 'Phone reading-order budget');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const metrics = await page.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      proofTop: document.querySelector('.hero-facts')!.getBoundingClientRect().top + scrollY,
      experienceTop: document.querySelector('#about')!.getBoundingClientRect().top + scrollY,
    }));
    expect(metrics.proofTop).toBeLessThan(1100);
    expect(metrics.experienceTop).toBeLessThan(1500);
    expect(metrics.height).toBeLessThan(7500);
    await expect(page.locator('.rack')).toHaveCount(0);
    await expect(page.locator('#projects .plate-media')).toBeVisible();
    await testInfo.attach('mobile-homepage', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  });

  test('desktop nav anchors and CTA targets work', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop-only anchor validation');

    await page.goto('/');
    const primaryNav = page.locator('nav[aria-label="Primary"]');

    await expect(page).toHaveTitle('Shane Kanterman | Data Center Technician and Infrastructure Work');
    await expect(page.getByRole('heading', { level: 1, name: 'Everything I run, in one rack.' })).toBeVisible();

    const sections = [
      ['Work', 'projects'],
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
    await expect(top.getByRole('link', { name: 'Explore my engineering work' })).toHaveAttribute('href', '#about');
    await top.getByRole('link', { name: 'Explore KanterLabs', exact: true }).click();
    await expect(page).toHaveURL(/\/kanterlabs\/?$/);
    await page.goto('/');

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
    await expect(page.locator('#mobile-nav')).toContainText('Work');

    await expectHashLinkToReachSection(
      page,
      () => page.locator('#mobile-nav').getByRole('link', { name: 'Work' }).click(),
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
    expect(count).toBe(5);

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
    expect(order).toEqual(['top', 'about', 'projects', 'skills', 'contact']);
  });

  test('selected work pairs evidence with case studies in project order', async ({ page }) => {
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
    await page.goto('/projects');

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
