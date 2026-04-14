import { expect, type Page } from '@playwright/test';

export async function expectHashLinkToReachSection(
  page: Page,
  trigger: () => Promise<unknown>,
  sectionId: string,
  options: { maxTop?: number; minTop?: number } = {},
) {
  const { maxTop = 220, minTop = 0 } = options;

  await trigger();
  await expect.poll(async () => page.evaluate(() => window.location.hash)).toBe(`#${sectionId}`);

  await expect
    .poll(async () => {
      return page.evaluate((id) => {
        const element = document.getElementById(id);
        return element ? Math.round(element.getBoundingClientRect().top) : null;
      }, sectionId);
    }, { timeout: 4_000 })
    .toBeLessThanOrEqual(maxTop);

  const top = await page.evaluate(
    (id) => {
      const element = document.getElementById(id);
      return element ? Math.round(element.getBoundingClientRect().top) : null;
    },
    sectionId,
  );

  expect(top).not.toBeNull();
  expect(top!).toBeGreaterThanOrEqual(minTop);
  expect(top!).toBeLessThanOrEqual(maxTop);
}

export async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
}
