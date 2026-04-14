import { test, expect } from '@playwright/test';

test.describe('visual coverage', () => {
  test('captures homepage screenshot', async ({ page }, testInfo) => {
    await page.goto('/');

    const screenshot = testInfo.outputPath('home.png');
    await page.screenshot({ path: screenshot, fullPage: true, type: 'png' });
    await testInfo.attach('home', { path: screenshot, contentType: 'image/png' });

    await expect(page.getByRole('heading', { level: 1, name: 'Building software with infrastructure discipline.' })).toBeVisible();
  });

  for (const entry of [
    ['/projects/multi-node-portfolio', 'featured-case-study'],
    ['/projects/self-hosted-dev-server', 'homelab-case-study'],
    ['/projects/data-center-operations', 'datacenter-case-study'],
  ] as const) {
    test(`captures screenshot for ${entry[1]}`, async ({ page }, testInfo) => {
      await page.goto(entry[0]);

      const screenshot = testInfo.outputPath(`${entry[1]}.png`);
      await page.screenshot({ path: screenshot, fullPage: true, type: 'png' });
      await testInfo.attach(entry[1], { path: screenshot, contentType: 'image/png' });
    });
  }
});
