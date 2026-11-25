import { test, expect } from '@playwright/test';
import { expectNoHorizontalOverflow } from './helpers/navigation';
import raw from '../src/data/working-on.json' with { type: 'json' };
import { parseWorkingOn } from '../src/lib/workingOn';

// The data is refreshed nightly, so these assertions are about structure and
// the page's honesty to whatever the current file says, never fixed values.
const data = parseWorkingOn(raw);

test.describe('What I’m working on', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
  });

  test('renders one card per project with an accurate day strip', async ({ page }) => {
    const section = page.locator('#now');
    await expect(section.getByRole('heading', { level: 2, name: 'What I’m working on.' })).toBeVisible();
    const cards = section.locator('[data-working-on-project]');
    await expect(cards).toHaveCount(data.projects.length);

    for (const [index, project] of data.projects.entries()) {
      const card = cards.nth(index);
      await expect(card.getByRole('heading', { level: 3 })).toHaveText(project.name);
      const strip = card.locator('.working-on-days');
      await expect(strip.locator('span')).toHaveCount(data.stripDays);
      await expect(strip.locator('span.is-worked')).toHaveCount(project.daysWorked.length);
      await expect(strip).toHaveAttribute('role', 'img');
      await expect(strip).toHaveAttribute(
        'aria-label',
        `Worked on ${project.daysWorked.length} of the last ${data.stripDays} days`,
      );
      if (project.shipped.length === 0) {
        await expect(card.locator('.working-on-empty')).toBeVisible();
      } else {
        const items = card.locator('.working-on-shipped li');
        await expect(items).toHaveCount(project.shipped.length);
        for (const [i, item] of project.shipped.entries()) {
          await expect(items.nth(i).locator('.working-on-title')).toHaveText(item.title);
          await expect(items.nth(i).locator('time')).toHaveAttribute('datetime', item.date);
        }
      }
    }
  });

  test('only links to pages on this site', async ({ page, request }) => {
    const hrefs = await page.locator('#now a').evaluateAll((links) => links.map((a) => a.getAttribute('href')));
    expect(hrefs).toEqual(data.projects.flatMap((project) => (project.href ? [project.href] : [])));
    for (const href of hrefs) {
      expect(href, 'site-relative').toMatch(/^\/[a-z0-9/-]*$/);
      expect((await request.get(href!)).status(), href!).toBe(200);
    }
  });

  test('the lead card spans the row on desktop and cards stack on phones', async ({ page, isMobile }) => {
    const cards = page.locator('#now [data-working-on-project]');
    test.skip((await cards.count()) < 3, 'Needs a lead card and a row of two');
    const grid = (await page.locator('#now .working-on-grid').boundingBox())!;
    const lead = (await cards.nth(0).boundingBox())!;
    const second = (await cards.nth(1).boundingBox())!;
    const third = (await cards.nth(2).boundingBox())!;
    expect(Math.abs(lead.width - grid.width)).toBeLessThanOrEqual(1);
    if (isMobile) {
      expect(Math.abs(second.width - grid.width)).toBeLessThanOrEqual(1);
      expect(third.y).toBeGreaterThan(second.y + second.height - 1);
    } else {
      expect(second.width).toBeLessThan(grid.width * 0.55);
      expect(Math.abs(second.y - third.y)).toBeLessThanOrEqual(1);
    }
    await expectNoHorizontalOverflow(page);
  });
});

test('the working-on data rejects malformed refreshes', () => {
  expect(() => parseWorkingOn({ ...raw, refreshedOn: 'Nov 25' })).toThrow(/refreshedOn/);
  expect(() => parseWorkingOn({ ...raw, projects: [{ ...raw.projects[0], href: 'https://github.com/x' }] })).toThrow(
    /href/,
  );
  expect(() =>
    parseWorkingOn({ ...raw, projects: [{ ...raw.projects[0], shipped: [{ kind: 'secret', title: 'x', date: '2026-11-25' }] }] }),
  ).toThrow(/kind/);
});
