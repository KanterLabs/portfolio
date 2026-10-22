import { test, expect } from '@playwright/test';
import { expectNoHorizontalOverflow } from './helpers/navigation';

const flagshipSlugs = ['helm', 'ActionView', 'nfl-scores', 'zeusos', 'greenlit-app'];
const moreSlugs = ['linkshare', 'ncspot', 'RunComp', 'portfolio'];
const publicSlugs = [...flagshipSlugs, ...moreSlugs];

test.describe('KanterLabs catalog', () => {
  test('is reachable from home and exposes the complete public catalog with a route back', async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.locator('main a[href="/kanterlabs"]').first().click();
    await expect(page).toHaveURL(/\/kanterlabs\/?$/);
    await expect(page.getByRole('heading', { level: 1, name: 'KanterLabs' })).toBeVisible();

    const rack = page.locator('#kanterlabs');
    expect(await rack.locator('[data-lab-repo]').evaluateAll((units) => units.map((unit) => unit.getAttribute('data-lab-repo'))))
      .toEqual(publicSlugs);
    for (const slug of publicSlugs) {
      await expect(rack.locator(`[data-lab-repo="${slug}"] a.rack-link`)).toHaveAttribute(
        'href', slug === 'helm' ? '/projects/helm' : `https://github.com/KanterLabs/${slug}`,
      );
    }
    for (const slug of flagshipSlugs) {
      await expect(page.locator(`#plates .plate[data-lab-repo="${slug}"]`).getByRole('heading').getByRole('link'))
        .toHaveAttribute('href', `https://github.com/KanterLabs/${slug}`);
    }
    for (const slug of moreSlugs) {
      const item = page.locator(`#more-projects [data-lab-repo="${slug}"]`);
      await expect(item.getByRole('heading')).toBeVisible();
      await expect(item.getByRole('link', { name: 'Source on GitHub' }))
        .toHaveAttribute('href', `https://github.com/KanterLabs/${slug}`);
    }
    // Treat the checked-in catalog as an allowlist: no unlisted repository may leak.
    for (const href of await page.locator('a[href^="https://github.com/KanterLabs/"]').evaluateAll(
      (links) => links.map((link) => (link as HTMLAnchorElement).href),
    )) {
      expect(publicSlugs).toContain(new URL(href).pathname.split('/')[2]);
    }
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('kanterlabs-catalog.png'), fullPage: true });
    await page.getByRole('navigation', { name: 'Catalog' }).getByRole('link', { name: 'Contact', exact: true }).click();
    await expect(page).toHaveURL(/\/#contact$/);
    await expect(page.locator('#contact')).toBeVisible();
    await page.goto('/kanterlabs');
    await page.getByRole('navigation', { name: 'Catalog' }).getByRole('link', { name: 'Home', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`the visible Helm artwork has a meaningful description in ${theme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.addInitScript(() => localStorage.clear());
      await page.goto('/kanterlabs');
      const media = page.locator('#plates [data-lab-repo="helm"] .lab-media');
      await expect(media.getByRole('img', { name: /Helm banner: a Kanban board/ })).toBeVisible();
      const alts = await media.locator('img').evaluateAll((images) => images.map((image) => image.alt));
      expect(alts[0]).toBeTruthy();
      expect(alts[1]).toBe(alts[0]);
    });
  }

  test('reduced motion starts paused and keyboard playback works without autoplay', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/kanterlabs');
    const video = page.locator('[data-lab-video]');
    await video.scrollIntoViewIfNeeded();
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
    const play = page.getByRole('button', { name: 'Play NFL Scores video', exact: true });
    await play.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(false);
    const pause = page.getByRole('button', { name: 'Pause NFL Scores video', exact: true });
    await expect(pause).toBeVisible();
    await pause.press('Space');
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
    await expect(play).toBeVisible();
  });

  test('a user pause survives leaving and reentering the viewport and motion preference changes', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/kanterlabs');
    const video = page.locator('[data-lab-video]');
    await video.scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Play NFL Scores video', exact: true }).click();
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(false);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.getByRole('button', { name: 'Pause NFL Scores video', exact: true }).click();
    await page.locator('#more-projects').scrollIntoViewIfNeeded();
    await expect.poll(() => video.evaluate((el) => el.getBoundingClientRect().bottom <= 0)).toBe(true);
    await video.scrollIntoViewIfNeeded();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForTimeout(400); // Allow a new intersection callback to attempt a restart.
    expect(await video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
    await expect(page.getByRole('button', { name: 'Play NFL Scores video', exact: true })).toBeVisible();
  });

  test('changing to reduced motion stops a playing video', async ({ page }) => {
    // Establish the initial preference before navigation so Chromium cannot
    // coalesce a rapid reduce -> no-preference -> reduce sequence.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/kanterlabs');
    const video = page.locator('[data-lab-video]');
    await video.scrollIntoViewIfNeeded();
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(false);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
  });

  test('without JavaScript, native video controls and catalog links remain available', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, javaScriptEnabled: false, reducedMotion: 'reduce' });
    const page = await context.newPage();
    try {
      await page.goto('/kanterlabs');
      await expect(page.getByRole('heading', { level: 1, name: 'KanterLabs' })).toBeVisible();
      const video = page.locator('[data-lab-video]');
      await expect(video).toHaveAttribute('controls', '');
      await expect(video).not.toHaveAttribute('autoplay');
      await expect(video).toHaveAttribute('poster', /nfl-touchdown-poster/);
      await expect(video).toBeVisible();
      await expect(page.locator('#more-projects').getByRole('link', { name: 'Source on GitHub' })).toHaveCount(4);
    } finally {
      await context.close();
    }
  });
});
