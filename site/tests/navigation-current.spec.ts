import { test, expect } from '@playwright/test';

test('homepage navigation tracks sections in both directions and clears at the hero', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const current = page.locator('[data-nav-link][aria-current="location"]');
  await expect(current).toHaveCount(0);

  for (const id of ['about', 'projects', 'skills', 'contact', 'projects', 'about']) {
    await page.locator(`#${id}`).evaluate((section) => section.scrollIntoView());
    await expect(current).toHaveCount(2); // Desktop and mobile navigation stay in sync.
    await expect(current.nth(0)).toHaveAttribute('data-nav-link', id);
    await expect(current.nth(1)).toHaveAttribute('data-nav-link', id);
  }

  await page.locator('#top').evaluate((section) => section.scrollIntoView());
  await expect(current).toHaveCount(0);
});

test('section tracking works in a wide, short viewport and after resizing', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#projects');
  const current = page.locator('[data-nav-link="projects"][aria-current="location"]');
  await expect(current).toHaveCount(2);
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.locator('#projects').evaluate((section) => section.scrollIntoView());
  await expect(current).toHaveCount(2);
});
