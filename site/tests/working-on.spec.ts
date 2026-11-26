import { test, expect } from '@playwright/test';
import { expectNoHorizontalOverflow } from './helpers/navigation';
import raw from '../src/data/working-on.json' with { type: 'json' };
import { parseWorkingOn, relativeDay, stripDates } from '../src/lib/workingOn';

// The data is refreshed nightly, so these assertions are about structure and
// the page's honesty to whatever the current file says, never fixed values.
const data = parseWorkingOn(raw);
const MAX_CARDS = 3;
const cardProjects = data.projects.slice(0, MAX_CARDS);
const alsoProjects = data.projects.slice(MAX_CARDS);

test.describe('What I’m working on', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
  });

  test('cards the most active projects with an accurate intensity strip', async ({ page }) => {
    const section = page.locator('#now');
    await expect(section.getByRole('heading', { level: 2, name: 'What I’m working on.' })).toBeVisible();
    const cards = section.locator('[data-working-on-project]');
    await expect(cards).toHaveCount(cardProjects.length);

    for (const [index, project] of cardProjects.entries()) {
      const card = cards.nth(index);
      await expect(card.getByRole('heading', { level: 3 })).toHaveText(project.name);
      const strip = card.locator('.working-on-days');
      const cells = strip.locator('span');
      await expect(cells).toHaveCount(data.stripDays);
      const levels = await cells.evaluateAll((spans) => spans.map((span) => span.getAttribute('data-level')));
      const expected = stripDates(data).map((day) => project.activity[day]?.toString() ?? null);
      expect(levels).toEqual(expected);
      const worked = Object.keys(project.activity).length;
      await expect(strip).toHaveAttribute('role', 'img');
      await expect(strip).toHaveAttribute('aria-label', `Worked on ${worked} of the last ${data.stripDays} days`);
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

  test('each intensity level has its own fill', async ({ page }) => {
    const fills = await page.evaluate(() =>
      [1, 2, 3, 4].flatMap((level) => {
        const probe = document.querySelector(`#now .working-on-days [data-level="${level}"]`);
        return probe ? [getComputedStyle(probe).backgroundColor] : [];
      }),
    );
    expect(fills.length).toBeGreaterThan(1);
    expect(new Set(fills).size).toBe(fills.length);
  });

  test('lists projects beyond the cards on one line', async ({ page }) => {
    const also = page.locator('#now [data-working-on-also]');
    if (alsoProjects.length === 0) {
      await expect(also).toHaveCount(0);
      return;
    }
    const items = also.locator('[data-working-on-also-project]');
    await expect(items).toHaveCount(alsoProjects.length);
    for (const [i, project] of alsoProjects.entries()) {
      await expect(items.nth(i)).toContainText(project.name);
      await expect(items.nth(i)).toContainText(`${Object.keys(project.activity).length}/${data.stripDays} days`);
    }
  });

  test('says "today" only when the viewer’s date matches', async ({ page }) => {
    const today = await page.evaluate(() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    });
    const times = page.locator('#now [data-working-on-relative]');
    for (const [i, project] of cardProjects.entries()) {
      const time = times.nth(i);
      await expect(time).toHaveAttribute('datetime', project.lastWorked);
      const dot = page.locator('#now [data-working-on-project]').nth(i).locator('.working-on-dot');
      if (project.lastWorked === today) {
        await expect(time).toHaveText('today');
        await expect(dot).toHaveClass(/is-today/);
      } else {
        await expect(time).not.toHaveText('today');
        await expect(dot).not.toHaveClass(/is-today/);
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
  expect(() => parseWorkingOn({ ...raw, projects: [{ ...raw.projects[0], activity: { '2026-11-25': 9 } }] })).toThrow(
    /1-4/,
  );
  expect(() => parseWorkingOn({ ...raw, projects: [{ ...raw.projects[0], activity: ['2026-11-25'] }] })).toThrow(
    /activity/,
  );
});

test('relative days are only claimed for today and yesterday', () => {
  expect(relativeDay('2026-11-25', '2026-11-25')).toBe('today');
  expect(relativeDay('2026-11-24', '2026-11-25')).toBe('yesterday');
  expect(relativeDay('2026-11-20', '2026-11-25')).toBeNull();
});
