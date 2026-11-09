import { expect, test } from '@playwright/test';
import { PLAYTEST_HREF, DISCORD_HREF, HOSTING_ALT, ACCENT, BORDER, open } from './helpers/dct';

test.describe('Data Center Tycoon page', () => {
  test('core loop is a six-tile diagram', async ({ page, isMobile }) => {
    await open(page);
    const tiles = page.locator('#gameplay .loop-panel .loop-steps > li');
    await expect(page.locator('#gameplay h2')).toHaveText('Six steps, on repeat.');
    await expect(tiles).toHaveCount(6);
    await expect(tiles.locator('h3')).toHaveText([
      'Plan the floor',
      'Run power, cooling & network',
      'Build servers',
      'Sell hosting',
      'Keep it up',
      'Expand',
    ]);
    await expect(tiles.locator('.step-num')).toHaveText(['01', '02', '03', '04', '05', '06']);
    await expect(tiles.locator('p')).toHaveCount(6);
    await expect(page.locator('#gameplay')).toContainText('Repeat, from garage to hyperscale.');

    // Only tile 05 is the selected state.
    const borders = await tiles.evaluateAll((els) => els.map((el) => getComputedStyle(el).borderTopColor));
    expect(borders.filter((c) => c === 'rgb(74, 149, 234)')).toHaveLength(1);
    expect(borders[4]).toBe('rgb(74, 149, 234)');

    const boxes = await tiles.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, width: r.width };
      }),
    );
    if (isMobile) {
      boxes.forEach((b, i) => {
        expect(b.width).toBeGreaterThanOrEqual(300);
        if (i > 0) expect(b.top).toBeGreaterThan(boxes[i - 1].bottom);
      });
      const rail = await tiles.nth(1).evaluate((el) => {
        const s = getComputedStyle(el, '::before');
        return { content: s.content, width: s.width, bg: s.backgroundColor };
      });
      expect(rail.content).not.toBe('none');
      expect(rail.width).toBe('1px');
      expect(rail.bg).toBe(BORDER);
    } else {
      boxes.forEach((b) => {
        expect(Math.abs(b.top - boxes[0].top)).toBeLessThanOrEqual(2);
        expect(b.width).toBeGreaterThanOrEqual(150);
      });
      const chevron = await tiles.nth(1).evaluate((el) => {
        const s = getComputedStyle(el, '::before');
        return { content: s.content, border: s.borderTopWidth };
      });
      expect(chevron.content).not.toBe('none');
      expect(parseFloat(chevron.border)).toBeGreaterThan(0);
    }
  });

  test('screenshots are large, captioned figures that open at full size', async ({ page, isMobile, request }) => {
    await open(page);
    const imgs = page.locator('.screen-grid img');
    await expect(imgs).toHaveCount(3);

    const frames = page.locator('.screen-grid .shot-frame');
    await expect(frames).toHaveCount(3);
    const imgBoxes = [];
    for (let i = 0; i < 3; i++) {
      await imgs.nth(i).scrollIntoViewIfNeeded();
      const b = await imgs.nth(i).boundingBox();
      expect(b!.width).toBeGreaterThanOrEqual(isMobile ? 340 : i === 0 ? 1100 : 700);
      imgBoxes.push(b!);

      const frame = frames.nth(i);
      const href = await frame.getAttribute('href');
      expect(href).toMatch(/\.png$/);
      const res = await request.get(href!);
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toContain('image/png');
      await expect(frame).toHaveAttribute('aria-label', /^Open full-size screenshot: /);
      await expect(frame.getByText('⤢ Full size')).toBeVisible();
      // The badge sits in a footer strip below the screenshot, never over game pixels.
      const badge = await frame.locator('.shot-zoom').boundingBox();
      expect(badge!.y, 'badge starts at or below the image bottom').toBeGreaterThanOrEqual(b!.y + b!.height - 1);
      expect(badge!.height).toBeGreaterThanOrEqual(34);
    }

    await expect(imgs.first()).toHaveAttribute('alt', HOSTING_ALT);
    const figures = page.locator('figure.shot');
    await expect(figures.locator('figcaption h3')).toHaveText(['Hosting', 'Onboarding by inbox', 'Every panel, one menu']);
    await expect(figures.first().locator('figcaption p')).toHaveText(
      'Sell VPS subscriptions or rent whole servers, with the HUD tracking cash, power, rack temperature and reputation.',
    );
    for (let i = 0; i < 3; i++) {
      const caption = figures.nth(i).locator('figcaption');
      await expect(caption.locator('.fig-label')).toHaveText(`FIG. 0${i + 1}`);
      await expect(caption.locator('h3')).not.toBeEmpty();
      await expect(caption.locator('p')).not.toBeEmpty();
    }

    const sides = await figures.evaluateAll((els) =>
      els.map((el) => {
        const frame = el.querySelector('.shot-frame')!.getBoundingClientRect();
        const cap = el.querySelector('figcaption')!.getBoundingClientRect();
        return { frameX: frame.x, capX: cap.x, frameBottom: frame.bottom, capTop: cap.top };
      }),
    );
    if (isMobile) {
      for (const s of sides) expect(s.capTop).toBeGreaterThanOrEqual(s.frameBottom);
    } else {
      // The lead frame spans the grid and its caption sits underneath.
      expect(sides[0].capTop).toBeGreaterThanOrEqual(sides[0].frameBottom);
      expect(sides[1].frameX).toBeLessThan(sides[1].capX);
      expect(sides[2].frameX).toBeGreaterThan(sides[2].capX);
    }
  });

  test('systems read as a spec grid with a build pipeline', async ({ page, isMobile }) => {
    await open(page);
    const items = page.locator('#systems .spec-grid > div');
    await expect(items).toHaveCount(8);
    await expect(items.locator('dt')).toHaveText([
      'Thermal',
      'Overlays',
      'Server builder',
      'Hosting',
      'Staff',
      'Customers',
      'Market',
      'Simulation',
    ]);
    const chips = page.locator('.spec-grid .overlay-chips span');
    await expect(chips).toHaveCount(5);
    await expect(chips).toHaveText(['Normal', 'Cooling', 'Power', 'Network', 'Service']);
    const normal = page.locator('.overlay-chips .normal');
    expect(await normal.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(ACCENT);
    expect(await normal.evaluate((el) => getComputedStyle(el, '::before').content)).toBe('none');
    for (const [cls, color] of [
      ['cool', 'rgb(72, 195, 235)'],
      ['power', 'rgb(235, 185, 65)'],
      ['net', 'rgb(72, 235, 135)'],
      ['svc', 'rgb(185, 115, 235)'],
    ]) {
      const dot = await page.locator(`.overlay-chips .${cls}`).evaluate((el) => getComputedStyle(el, '::before').backgroundColor);
      expect(dot, cls).toBe(color);
    }

    const rows = await items.evaluateAll((els) =>
      els.map((el) => ({
        item: el.getBoundingClientRect().top,
        dt: el.querySelector('dt')!.getBoundingClientRect().top,
        dd: el.querySelector('dd')!.getBoundingClientRect().top,
      })),
    );
    if (isMobile) {
      for (const r of rows) expect(Math.abs(r.dt - r.dd)).toBeLessThanOrEqual(4);
    } else {
      for (const r of rows.slice(0, 4)) expect(Math.abs(r.item - rows[0].item)).toBeLessThanOrEqual(2);
    }

    await expect(page.locator('.build-panel h3')).not.toBeEmpty();
    const steps = page.locator('#systems .pipeline > li');
    await expect(steps).toHaveCount(5);
    await expect(steps.last()).toHaveText('A playtest build ships');
    await expect(page.getByText('PLAYTEST BUILDS', { exact: true })).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText('The simulation core is separate from the UI');
  });

  test('closing panel frames the one ask', async ({ page }) => {
    await open(page);
    const closingLinks = page.locator('.closing-actions a');
    await expect(closingLinks).toHaveText([/^\s*Join the Discord\s*$/, /Request playtest access/]);
    const discord = page.locator('.closing').getByRole('link', { name: 'Join the Discord' });
    await expect(discord).toHaveAttribute('href', DISCORD_HREF);
    await expect(discord).toHaveClass(/primary/);
    const cta = page.locator('.closing').getByRole('link', { name: 'Request playtest access' });
    await expect(cta).toHaveAttribute('href', PLAYTEST_HREF);
    for (const link of [discord, cta]) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator('.closing')).toHaveClass(/dct-panel/);
    await expect(page.locator('.closing h2')).toHaveText(/Five nines\s*or bust\./);
    await expect(page.locator('.closing-note')).toBeVisible();
    await expect(page.locator('.closing-note')).toHaveText('Playtest access opens a pre-filled email to Shane.');
    await expect(page.locator('.closing')).toContainText('Playtest builds go out in small batches.');
    await expect(page.locator('.closing-art img')).toHaveCount(1);
    expect(await page.locator('.closing-art img').getAttribute('alt')).toMatch(/\S/);
    const art = await page.locator('.closing-art').evaluate((el) => {
      const s = getComputedStyle(el);
      return { border: s.borderTopColor, width: s.borderTopWidth, radius: s.borderTopLeftRadius };
    });
    expect(art).toEqual({ border: BORDER, width: '1px', radius: '12px' });
  });

  test('the shell gradient runs under the closing margin to the footer', async ({ page }) => {
    await open(page);
    const edges = await page.evaluate(() => {
      const shell = document.querySelector('.dct-shell')!.getBoundingClientRect();
      const closing = document.querySelector('.closing')!.getBoundingClientRect();
      const footer = document.querySelector('.site-footer')!.getBoundingClientRect();
      return { shellBottom: shell.bottom, closingBottom: closing.bottom, footerTop: footer.top };
    });
    // The closing margin stays inside the shell, so no body-coloured band shows between panel and footer.
    expect(edges.shellBottom).toBeGreaterThan(edges.closingBottom + 40);
    expect(Math.abs(edges.footerTop - edges.shellBottom)).toBeLessThanOrEqual(1);
  });
});
