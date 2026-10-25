import { test, expect, type Page } from '@playwright/test';
import { expectHashLinkToReachSection, expectNoHorizontalOverflow } from './helpers/navigation';
import { parseColor, effectiveBackground, getContrastRatio } from './helpers/contrast';

// The public catalog in src/lib/kanterlabs.ts, in order. Restated here rather
// than imported: that module pulls in image assets Playwright can't load.
const CATALOG = [
  ['helm', 'Helm'],
  ['ActionView', 'ActionView'],
  ['nfl-scores', 'NFL Scores'],
  ['resonance', 'Resonance'],
  ['greenlit-app', 'Greenlit'],
  ['portfolio', 'Portfolio'],
] as const;
const unitHref = (slug: string) => (slug === 'helm' ? '/projects/helm' : `https://github.com/KanterLabs/${slug}`);

const repoRows = (page: Page) => page.locator('#kanterlabs .rack-row[data-lab-repo]');

test.describe('KanterLabs rack', () => {
  test('the rack mounts every public repository once, in catalog order', async ({ page }) => {
    await page.goto('/kanterlabs');

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
    await page.goto('/kanterlabs');

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
    const oneU = await page.locator('#kanterlabs .rack-row[data-lab-repo="portfolio"]').boundingBox();
    const leadBox = await lead.boundingBox();
    expect(Math.abs(leadBox!.height - oneU!.height * 4)).toBeLessThanOrEqual(1);
    // 1U rows are whole-row link targets: keep them >= 24px (WCAG 2.5.8).
    expect(oneU!.height).toBeGreaterThanOrEqual(24);
  });

  test('callouts sit outside the cabinet, centred on their unit', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Leader lines are a desktop-only treatment');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/kanterlabs');

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
    await page.goto('/kanterlabs');

    await page.locator('#kanterlabs .rack-row[data-lab-repo="greenlit-app"] .rack-face').scrollIntoViewIfNeeded();
    const face = await page.locator('#kanterlabs .rack-row[data-lab-repo="greenlit-app"] .rack-face').boundingBox();
    const hitHref = await page.evaluate(
      ({ x, y }) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('a')?.getAttribute('href'),
      { x: face!.x + face!.width / 2, y: face!.y + face!.height / 2 },
    );
    expect(hitHref).toBe('https://github.com/KanterLabs/greenlit-app');
  });

  test('hovering a unit pulls its faceplate, and reduced motion keeps it still', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Hover is a pointer interaction');
    await page.goto('/kanterlabs');

    const row = page.locator('#kanterlabs .rack-row[data-lab-repo="portfolio"]');
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
    await page.goto('/kanterlabs');

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
    await page.goto('/kanterlabs');
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

  test('plates follow the rack: same order, same callout numbers', async ({ page }) => {
    await page.goto('/kanterlabs');
    const plates = page.locator('#plates .plate');
    const slugs = await plates.evaluateAll((els) => els.map((el) => el.getAttribute('data-lab-repo')));
    expect(slugs).toEqual(['helm', 'ActionView', 'nfl-scores', 'resonance', 'greenlit-app']);

    for (const slug of slugs) {
      const rackCallout = await page
        .locator(`#kanterlabs .rack-row[data-lab-repo="${slug}"] .rack-num`)
        .textContent();
      await expect(page.locator(`#plates .plate[data-lab-repo="${slug}"] .plate-callout`)).toHaveText(rackCallout!);
      const media = await page.locator(`#plates .plate[data-lab-repo="${slug}"] .plate-media`).boundingBox();
      expect(media!.height, `${slug} plate media`).toBeGreaterThan(120);
    }
  });

});
