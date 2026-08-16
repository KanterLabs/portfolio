import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'];

type ChatRequest = {
  message: string;
  history: unknown[];
  pagePath: string;
  visitorId: string;
};

type ChatResponse = {
  body: string;
  status?: number;
};

type ChatResponseFactory = (request: ChatRequest, attempt: number) => ChatResponse;

function event(name: string, data: Record<string, unknown>): string {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

function stream(...events: string[]): ChatResponse {
  return {
    body: events.join(''),
  };
}

async function installChatRoute(page: Page, factory: ChatResponseFactory): Promise<ChatRequest[]> {
  const requests: ChatRequest[] = [];

  await page.route('**/api/chat', async (route: Route) => {
    const request = route.request().postDataJSON() as ChatRequest;
    requests.push(request);

    const response = factory(request, requests.length);
    await route.fulfill({
      status: response.status ?? 200,
      headers: {
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'content-type': 'text/event-stream; charset=utf-8',
      },
      body: response.body,
    });
  });

  return requests;
}

async function openChat(page: Page) {
  await expect(page.locator('[data-portfolio-chat]')).toHaveCount(1);

  const launcher = page.locator('[data-chat-launcher]');
  const panel = page.locator('[data-chat-panel]');
  await expect(launcher).toBeVisible();
  await launcher.click();
  await expect(panel).toBeVisible();

  return { launcher, panel };
}

async function waitForRequest(requests: ChatRequest[], count: number): Promise<ChatRequest> {
  await expect
    .poll(() => requests.length, { message: `expected ${count} chat request(s)` })
    .toBe(count);
  return requests[count - 1]!;
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

test('chat renders on the homepage and project pages when enabled', async ({ page }) => {
  for (const path of ['/', '/projects/hostlet']) {
    await page.goto(path);
    await expect(page.locator('[data-portfolio-chat]')).toHaveCount(1);
    await expect(page.locator('[data-chat-launcher]')).toBeVisible();
  }
});

test('launcher opens and closes the panel, and Escape restores launcher focus', async ({ page }) => {
  await page.goto('/');
  const { launcher, panel } = await openChat(page);
  const close = page.locator('[data-chat-close]');

  await expect(launcher).toBeHidden();
  await expect(close).toBeVisible();
  await close.click();
  await expect(panel).toBeHidden();
  await expect(launcher).toBeVisible();

  await launcher.click();
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(launcher).toBeFocused();
});

test('starter prompts send the current page and visitor context', async ({ page }) => {
  const requests = await installChatRoute(page, () =>
    stream(event('delta', { delta: 'Starter response.' }), event('done', {})),
  );

  await page.goto('/projects/hostlet');
  await openChat(page);

  const starter = page.locator('[data-chat-starter]').first();
  await expect(starter).toBeVisible();
  const prompt = (await starter.innerText()).replace(/\s+/g, ' ').trim();
  expect(prompt).not.toBe('');

  await starter.click();
  await expect(page.locator('.portfolio-chat-starters')).toBeHidden();
  const request = await waitForRequest(requests, 1);

  expect(request.message).toBe(prompt);
  expect(request.pagePath).toBe('/projects/hostlet');
  expect(Array.isArray(request.history)).toBe(true);
  expect(request.visitorId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  await expect(page.locator('[data-chat-transcript]')).toContainText('Starter response.');
});

test('assembles streamed deltas and renders only allowlisted source links', async ({ page }) => {
  const requests = await installChatRoute(page, () =>
    stream(
      event('sources', {
        sources: [
          { title: 'Hostlet project', href: '/projects/hostlet' },
          { title: 'Untrusted page', href: 'https://evil.example.invalid/collect' },
        ],
      }),
      event('delta', { delta: 'A response in ' }),
      event('delta', { delta: 'two streamed pieces.' }),
      event('done', {}),
    ),
  );

  await page.goto('/');
  await openChat(page);

  const input = page.locator('[data-chat-input]');
  await input.fill('Tell me about Hostlet.');
  await page.locator('[data-chat-send]').click();
  await waitForRequest(requests, 1);

  await expect(page.locator('[data-chat-transcript]')).toContainText('A response in two streamed pieces.');

  const sources = page.locator('[data-chat-sources]');
  await expect(sources).toBeVisible();
  const links = sources.locator('a');
  await expect(links).toHaveCount(1);
  await expect(links.first()).toHaveAttribute('href', /\/projects\/hostlet\/?$/);
  await expect(links.first()).toContainText('Hostlet project');
  await expect(sources).not.toContainText('Untrusted page');
});

test('keeps a long streamed assistant response in view', async ({ page }) => {
  const responseChunk = 'Shane builds reliable infrastructure with explicit boundaries and rollback paths. ';
  const longResponse = responseChunk.repeat(18);
  await installChatRoute(page, () =>
    stream(
      ...Array.from({ length: 18 }, () => event('delta', { delta: responseChunk })),
      event('done', {}),
    ),
  );

  await page.goto('/');
  await openChat(page);
  await page.locator('[data-chat-input]').fill('Describe Shane’s infrastructure work.');
  await page.locator('[data-chat-send]').click();

  await expect(page.locator('[data-chat-transcript]')).toContainText(longResponse.trim());
  const scroll = await page.locator('[data-chat-transcript]').evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
  }));
  expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);
  expect(scroll.scrollTop + scroll.clientHeight).toBeGreaterThanOrEqual(scroll.scrollHeight - 2);
});

test('shows an SSE error and recovers on the next request', async ({ page }) => {
  const requests = await installChatRoute(page, (_request, attempt) => {
    if (attempt === 1) {
      return stream(event('error', { message: 'Temporary outage' }));
    }

    return stream(event('delta', { delta: 'Recovered successfully.' }), event('done', {}));
  });

  await page.goto('/');
  await openChat(page);

  const input = page.locator('[data-chat-input]');
  const send = page.locator('[data-chat-send]');
  const status = page.locator('[data-chat-status]');

  await input.fill('First attempt');
  await send.click();
  await waitForRequest(requests, 1);
  await expect(status).toContainText('Temporary outage');

  await input.fill('Retry after the outage');
  await send.click();
  await waitForRequest(requests, 2);
  await expect(page.locator('[data-chat-transcript]')).toContainText('Recovered successfully.');
  await expect(status).not.toContainText('Temporary outage');
});

test('bounds request history after repeated messages', async ({ page }) => {
  const requests = await installChatRoute(page, (_request, attempt) =>
    stream(event('delta', { delta: `Reply ${attempt}.` }), event('done', {})),
  );

  await page.goto('/');
  await openChat(page);

  const input = page.locator('[data-chat-input]');
  const send = page.locator('[data-chat-send]');
  const messageCount = 8;
  for (let index = 0; index < messageCount; index += 1) {
    await input.fill(`Question ${index + 1}`);
    await send.click();
    await waitForRequest(requests, index + 1);
    await expect(send).toBeEnabled();
  }

  const finalHistory = requests.at(-1)?.history;
  expect(Array.isArray(finalHistory)).toBe(true);
  expect(finalHistory!.length).toBeGreaterThan(0);
  // The client should send a rolling window, not the entire transcript.
  expect(finalHistory!.length).toBeLessThanOrEqual(6);
});

test('enforces the 800-character client message limit', async ({ page }) => {
  const requests = await installChatRoute(page, () =>
    stream(event('delta', { delta: 'Accepted.' }), event('done', {})),
  );

  await page.goto('/');
  await openChat(page);

  const input = page.locator('[data-chat-input]');
  await expect(input).toHaveAttribute('maxlength', '800');
  await input.fill('x'.repeat(800));
  await input.pressSequentially('x');
  await expect(input).toHaveValue('x'.repeat(800));

  await page.locator('[data-chat-send]').click();
  const request = await waitForRequest(requests, 1);
  expect(request.message).toHaveLength(800);
});

test('chat is absent from Greenlit and the 404 page', async ({ page }) => {
  const greenlitResponse = await page.goto('/greenlit');
  expect(greenlitResponse?.status()).toBe(200);
  await expect(page.locator('[data-portfolio-chat]')).toHaveCount(0);

  const notFoundResponse = await page.goto('/chat-test-page-does-not-exist');
  expect(notFoundResponse?.status()).toBe(404);
  await expect(page.locator('[data-portfolio-chat]')).toHaveCount(0);
});

test('chat panel remains usable at 320px without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  await openChat(page);

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  const undersized = await page
    .locator('[data-chat-launcher], [data-chat-close], [data-chat-send], [data-chat-starter]')
    .evaluateAll((elements) =>
      elements.flatMap((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) return [];
        if (rect.width >= 44 && rect.height >= 44) return [];
        return [`${element.tagName.toLowerCase()} ${Math.round(rect.width)}x${Math.round(rect.height)}`];
      }),
    );
  expect(undersized).toEqual([]);
});

for (const theme of ['light', 'dark'] as const) {
  test(`chat panel follows the ${theme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

    const { panel } = await openChat(page);
    const colors = await panel.evaluate((element) => {
      const style = getComputedStyle(element);
      return { backgroundColor: style.backgroundColor, color: style.color };
    });
    expect(colors.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(colors.color).not.toBe('rgba(0, 0, 0, 0)');
  });
}

test('axe scan passes with the chat panel open', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await openChat(page);
  await settle(page);

  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(
    results.violations,
    results.violations
      .map((violation) => `${violation.id}: ${violation.help}\n  ${violation.nodes.map((node) => node.target.join(' ')).join('\n  ')}`)
      .join('\n'),
  ).toEqual([]);
});
