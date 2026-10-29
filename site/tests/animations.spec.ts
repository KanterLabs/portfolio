import { test, expect } from '@playwright/test';

test('homepage reveals four supporting sheets without gating the hero', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Phones reveal everything immediately (BaseLayout skips the observer below 780px)');
  await page.goto('/');

  // The hero sheet is legible on arrival: no reveal class on it.
  await expect(page.locator('#top')).not.toHaveClass(/observe-animate/);
  await expect(page.locator('main > .sheet.observe-animate')).toHaveCount(4);
});

test('catalog rack motion stays brief', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Phones reveal everything immediately');
  await page.goto('/kanterlabs');

  // Leader lines draw in, and the whole cascade lands well inside 500ms.
  const leaders = page.locator('#kanterlabs .rack-leader');
  const count = await leaders.count();
  expect(count).toBe(8); // Six projects, the contact panel, and the power unit.
  const timings = await leaders.evaluateAll((els) =>
    els.map((el) => {
      const style = getComputedStyle(el);
      return {
        name: style.animationName,
        end: parseFloat(style.animationDuration) * 1000 + parseFloat(style.animationDelay) * 1000,
      };
    }),
  );
  for (const timing of timings) {
    expect(timing.name).toBe('rack-leader-draw');
    expect(timing.end, 'leader animation end (ms)').toBeLessThanOrEqual(500);
  }
});

test('motion is disabled when reduced motion is requested', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const motion = await page.evaluate(() => {
    const sheet = document.querySelector('#projects');
    return {
      sheetOpacity: sheet ? getComputedStyle(sheet).opacity : null,
      sheetTransform: sheet ? getComputedStyle(sheet).transform : null,
    };
  });

  expect(motion.sheetOpacity).toBe('1');
  // Settled: no transform, or the identity matrix .visible leaves behind.
  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(motion.sheetTransform);

  await page.goto('/kanterlabs');
  const leaders = page.locator('#kanterlabs .rack-leader');
  expect(await leaders.count()).toBe(8);
  for (const leader of await leaders.all()) {
    await expect(leader).toHaveCSS('animation-name', 'none');
  }
});

test('theme icons transition to match the selected mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');

  const toggle = page.locator('[data-theme-toggle]');
  // Fresh visit follows the system, shown by the monitor icon.
  await expect(page.locator('.theme-icon-auto')).toHaveCSS('opacity', '1');
  await expect(page.locator('.theme-icon-sun')).toHaveCSS('opacity', '0');
  await expect(page.locator('.theme-icon-moon')).toHaveCSS('opacity', '0');

  await toggle.click();
  await page.waitForTimeout(220);
  await expect(page.locator('.theme-icon-auto')).toHaveCSS('opacity', '0');
  await expect(page.locator('.theme-icon-sun')).toHaveCSS('opacity', '1');
  await expect(page.locator('.theme-icon-moon')).toHaveCSS('opacity', '0');

  await toggle.click();
  await page.waitForTimeout(220);
  await expect(page.locator('.theme-icon-sun')).toHaveCSS('opacity', '0');
  await expect(page.locator('.theme-icon-moon')).toHaveCSS('opacity', '1');
});

test('the brand rabbit waves on hover and holds still under reduced motion', async ({ page, browser, isMobile }) => {
  test.skip(isMobile, 'Hover is a pointer interaction');
  const frame = () =>
    page.locator('.site-header-rabbit').evaluate((el) => {
      const style = getComputedStyle(el);
      return `${style.getPropertyValue('--row') || '0'}/${style.getPropertyValue('--col') || '0'}`;
    });

  await page.goto('/');
  const rabbit = page.locator('.site-header-rabbit');
  await expect(rabbit).toHaveAttribute('aria-hidden', 'true');
  // Let the greeting finish, then hover the brand link: the wave row (1) plays.
  await expect.poll(frame, { timeout: 3000 }).toBe('0/0');
  await page.getByRole('link', { name: 'Shane Kanterman home' }).hover();
  await expect.poll(frame).toMatch(/^1\//);

  const reduced = await browser.newPage({ reducedMotion: 'reduce' });
  await reduced.goto('/');
  await reduced.getByRole('link', { name: 'Shane Kanterman home' }).hover();
  await reduced.waitForTimeout(1500);
  const still = await reduced.locator('.site-header-rabbit').evaluate((el) => {
    const style = getComputedStyle(el);
    return `${style.getPropertyValue('--row') || '0'}/${style.getPropertyValue('--col') || '0'}`;
  });
  expect(still).toBe('0/0');
  await reduced.close();
});
