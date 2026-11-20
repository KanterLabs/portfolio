import { test, expect } from '@playwright/test';

const PATH = '/projects/actionrunners';

test.describe('ActionRunners case study', () => {
  test('lifecycle example steps through all six stages with the keyboard', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url());
    });
    await page.goto(PATH);
    const demo = page.getByRole('region', { name: 'ActionRunners job lifecycle example' });
    await expect(demo).toContainText('Illustrative example with invented names.');
    const status = demo.getByRole('status');
    const prev = demo.getByRole('button', { name: 'Previous step' });
    const next = demo.getByRole('button', { name: 'Next step' });
    const reset = demo.getByRole('button', { name: 'Reset example' });
    await expect(status).toHaveText('Step 1 of 6: Gitea queues the job.');
    await expect(prev).toBeDisabled();
    await expect(demo.locator('[data-ar-token]')).toHaveText('job waiting');

    await next.focus();
    const titles = [
      'One ledger admits it',
      'A linked clone boots from a pinned template',
      'One single-use runner is delivered',
      'It runs exactly one job',
      'The VM powers off and is destroyed',
    ];
    for (const [index, title] of titles.entries()) {
      await page.keyboard.press('Enter');
      await expect(status).toHaveText(`Step ${index + 2} of 6: ${title}.`);
      await expect(demo.locator('[data-ar-step][aria-current="step"]')).toContainText(title);
    }
    await expect(demo.locator('[data-ar-token]')).toHaveText('VM 301 · gone');
    await expect(next).toBeDisabled();
    await expect(reset).toBeFocused();
    await expect(demo.locator('.ar-node.is-done')).toHaveCount(5);

    await page.keyboard.press('Enter');
    await expect(status).toHaveText('Step 1 of 6: Gitea queues the job.');
    await expect(next).toBeFocused();
    // Only the current step's detail is shown once the example is interactive.
    await expect(demo.locator('[data-ar-step]:visible')).toHaveCount(1);
    expect(requests).toEqual([]);
  });

  test('play advances on request and stops at the last stage', async ({ page }) => {
    await page.goto(PATH);
    const demo = page.getByRole('region', { name: 'ActionRunners job lifecycle example' });
    const status = demo.getByRole('status');
    // Nothing moves until the reader asks.
    await page.waitForTimeout(2000);
    await expect(status).toHaveText('Step 1 of 6: Gitea queues the job.');
    const play = demo.getByRole('button', { name: 'Play' });
    await play.click();
    await expect(demo.getByRole('button', { name: 'Pause' })).toBeVisible();
    await expect(status).toHaveText('Step 2 of 6: One ledger admits it.', { timeout: 4000 });
    await expect(status).toHaveText('Step 6 of 6: The VM powers off and is destroyed.', { timeout: 12000 });
    await expect(demo.getByRole('button', { name: 'Play' })).toBeVisible();
  });

  test('lifecycle example honours reduced motion and fits a phone', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(PATH);
    const demo = page.getByRole('region', { name: 'ActionRunners job lifecycle example' });
    await demo.scrollIntoViewIfNeeded();
    expect(await demo.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    // The site-wide reduced-motion rule collapses transitions to a hundredth of a millisecond.
    const duration = await demo.locator('[data-ar-token]').evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));
    expect(duration).toBeLessThanOrEqual(0.001);
    await demo.getByRole('button', { name: 'Next step' }).click();
    await expect(demo.getByRole('status')).toHaveText('Step 2 of 6: One ledger admits it.');
  });

  test('without JavaScript every step is listed and the controls stay hidden', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(PATH);
    const demo = page.getByRole('region', { name: 'ActionRunners job lifecycle example' });
    await expect(demo.locator('[data-ar-step]:visible')).toHaveCount(6);
    await expect(demo.getByRole('group', { name: 'Lifecycle steps' })).toBeHidden();
    await context.close();
  });

  test('recording and screenshots are labelled and disclose demo data', async ({ page }) => {
    await page.goto('/projects/kanterlabs-homelab#organization-wide-ephemeral-ci');
    await expect(page.locator('#organization-wide-ephemeral-ci')).toHaveCount(1);
    await page.getByRole('link', { name: 'ActionRunners case study' }).click();
    await expect(page).toHaveURL(new RegExp(`${PATH}/?$`));
    const video = page.locator('figure.ar-recording video');
    await expect(video).toHaveAttribute('poster', '/projects/actionrunners/board-live-poster.jpg');
    await expect(video).toHaveAttribute('aria-label', /ActionRunners dashboard updating live/);
    await expect(video.locator('source')).toHaveCount(2);
    await expect(page.locator('figure.ar-recording figcaption')).toContainText('synthetic demo data');
    const shots = page.locator('.diagram-trigger img[src^="/projects/actionrunners/"]');
    await expect(shots).toHaveCount(3);
    for (const shot of await shots.all()) {
      expect((await shot.getAttribute('alt'))?.length ?? 0).toBeGreaterThan(40);
    }
  });
});
