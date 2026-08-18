import { describe, expect, it } from 'vitest';
import {
  MAX_BODY_BYTES,
  MAX_HISTORY_MESSAGES,
  MAX_MESSAGE_CHARS,
  isAllowedOrigin,
  parseChatRequest,
} from '../src/validation.ts';

const origin = 'https://beta.shanekanterman.dev';
const visitorId = '123e4567-e89b-12d3-a456-426614174000';

function request(payload: unknown, headers: Record<string, string> = {}) {
  return new Request(`${origin}/api/chat`, {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(payload),
  });
}

describe('chat request validation', () => {
  it('accepts a bounded request and normalises visitor id', async () => {
    const result = await parseChatRequest(
      request({
        message: '  What is Hostlet?  ',
        history: [{ role: 'user', content: 'Tell me about projects.' }],
        pagePath: '/projects/hostlet',
        visitorId: visitorId.toUpperCase(),
      }),
    );

    expect(result).toEqual({
      ok: true,
      value: {
        message: 'What is Hostlet?',
        history: [{ role: 'user', content: 'Tell me about projects.' }],
        pagePath: '/projects/hostlet',
        visitorId,
      },
    });
  });

  it.each([
    ['message_too_long', { message: 'x'.repeat(MAX_MESSAGE_CHARS + 1) }],
    ['history_too_long', { message: 'hello', history: Array.from({ length: MAX_HISTORY_MESSAGES + 1 }, () => ({ role: 'user', content: 'x' })) }],
    ['invalid_page_path', { message: 'hello', pagePath: 'https://evil.example' }],
    ['invalid_visitor_id', { message: 'hello', visitorId: 'not-a-uuid' }],
  ])('rejects %s', async (code, partial) => {
    const result = await parseChatRequest(
      request({
        history: [],
        pagePath: '/',
        visitorId,
        ...partial,
      }),
    );

    expect(result).toEqual({ ok: false, issue: { code, status: 400 } });
  });

  it('rejects non-JSON and oversized bodies before parsing', async () => {
    const contentType = await parseChatRequest(
      request({}, { 'Content-Type': 'text/plain' }),
    );
    expect(contentType).toEqual({
      ok: false,
      issue: { code: 'invalid_content_type', status: 415 },
    });

    const oversized = new Request(`${origin}/api/chat`, {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        'Content-Length': String(MAX_BODY_BYTES + 1),
      },
      body: '{}',
    });
    await expect(parseChatRequest(oversized)).resolves.toEqual({
      ok: false,
      issue: { code: 'body_too_large', status: 413 },
    });
  });

  it('requires the configured origin for POST requests', () => {
    const env = { ALLOWED_ORIGIN: origin };
    expect(isAllowedOrigin(new Request(`${origin}/api/chat`, { headers: { Origin: origin } }), env)).toBe(true);
    expect(isAllowedOrigin(new Request(`${origin}/api/chat`, { headers: { Origin: 'https://evil.example' } }), env)).toBe(false);
    expect(isAllowedOrigin(new Request(`${origin}/api/chat`), env)).toBe(false);
  });
});
