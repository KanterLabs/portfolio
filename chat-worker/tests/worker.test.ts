import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.ts';

const origin = 'https://beta.shanekanterman.dev';
const env = {
  APP_ENV: 'beta',
  ALLOWED_ORIGIN: origin,
  OPENAI_MODEL: 'gpt-5.6-luna',
  KNOWLEDGE_VERSION: '2026-08-16',
};
const visitorId = '123e4567-e89b-12d3-a456-426614174000';

function post(body: unknown) {
  return new Request(`${origin}/api/chat`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function eventNames(text: string): string[] {
  return text
    .trim()
    .split('\n\n')
    .map((block) => block.match(/^event: (.+)$/m)?.[1] ?? '');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('portfolio chat Worker endpoints', () => {
  it('returns health without calling OpenAI and reports configuration state', async () => {
    const fetchMock = vi.fn(() => {
      throw new Error('OpenAI must not be called');
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await worker.fetch(
      new Request(`${origin}/api/chat/health`),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      service: 'portfolio-chat',
      environment: 'beta',
      knowledgeVersion: '2026-08-16',
      configured: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a sanitized not_configured SSE response before the secret exists', async () => {
    const response = await worker.fetch(
      post({ message: 'What is Hostlet?', history: [], pagePath: '/projects/hostlet', visitorId }),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const body = await response.text();
    expect(eventNames(body)).toEqual(['sources', 'error', 'done']);
    expect(body).toContain('"code":"not_configured"');
    expect(body).not.toContain('OPENAI_API_KEY');
  });

  it('validates origin, methods, and unknown paths safely', async () => {
    const badOrigin = await worker.fetch(
      new Request(`${origin}/api/chat`, {
        method: 'POST',
        headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
        body: '{}',
      }),
      { ...env, OPENAI_API_KEY: 'test-key' },
      {} as ExecutionContext,
    );
    expect(badOrigin.status).toBe(403);
    expect(await badOrigin.text()).toContain('origin_not_allowed');

    const wrongMethod = await worker.fetch(
      new Request(`${origin}/api/chat`, { method: 'GET' }),
      env,
      {} as ExecutionContext,
    );
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get('allow')).toBe('POST');

    const missing = await worker.fetch(
      new Request(`${origin}/api/chat/private`),
      env,
      {} as ExecutionContext,
    );
    expect(missing.status).toBe(404);
    expect(await missing.text()).not.toContain('private');
  });

  it('sends the exact Responses API controls and transforms its stream', async () => {
    const upstream = new Response(
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Hostlet is a deployment panel."}\n\n' +
        'event: response.completed\ndata: {"type":"response.completed"}\n\n',
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    );
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.openai.com/v1/responses');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(init?.signal?.aborted).toBe(false);
      const payload = JSON.parse(String(init?.body));
      expect(payload.model).toBe('gpt-5.6-luna');
      expect(payload.stream).toBe(true);
      expect(payload.reasoning).toEqual({ effort: 'low' });
      expect(payload.text).toEqual({ verbosity: 'low' });
      expect(payload.max_output_tokens).toBe(350);
      expect(payload.store).toBe(false);
      expect(payload.safety_identifier).toBe(visitorId);
      expect(payload.tools).toBeUndefined();
      return upstream;
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await worker.fetch(
      post({ message: 'What is Hostlet?', history: [], pagePath: '/projects/hostlet', visitorId }),
      { ...env, OPENAI_API_KEY: 'test-key' },
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(eventNames(await response.text())).toEqual(['sources', 'delta', 'done']);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('sanitises non-2xx upstream responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('secret upstream diagnostics', { status: 429 })),
    );

    const response = await worker.fetch(
      post({ message: 'Hello', history: [], pagePath: '/', visitorId }),
      { ...env, OPENAI_API_KEY: 'test-key' },
      {} as ExecutionContext,
    );
    expect(response.status).toBe(502);
    const body = await response.text();
    expect(body).toContain('upstream_error');
    expect(body).not.toContain('secret upstream diagnostics');
  });
});
