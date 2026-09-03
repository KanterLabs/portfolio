import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  finalizeChatExchange,
  sanitizeErrorCode,
  startChatExchange,
  type D1DatabaseLike,
  type D1PreparedStatementLike,
} from '../src/history.ts';

interface FakeCall {
  query: string;
  values: unknown[];
  runCalls: number;
}

class FakeStatement implements D1PreparedStatementLike {
  readonly call: FakeCall;

  constructor(call: FakeCall) {
    this.call = call;
  }

  bind(...values: unknown[]): D1PreparedStatementLike {
    this.call.values = values;
    return this;
  }

  async run(): Promise<unknown> {
    this.call.runCalls += 1;
    return { success: true };
  }
}

class FakeDatabase implements D1DatabaseLike {
  readonly calls: FakeCall[] = [];
  fail = false;

  prepare(query: string): D1PreparedStatementLike {
    if (this.fail) {
      throw new Error('D1 unavailable');
    }

    const call: FakeCall = { query, values: [], runCalls: 0 };
    this.calls.push(call);
    return new FakeStatement(call);
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('chat exchange history persistence', () => {
  it('inserts a started exchange with JSON request fields', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-23T10:00:00.000Z'));
    const db = new FakeDatabase();

    const exchange = await startChatExchange(db, {
      visitorId: 'visitor-123',
      environment: 'beta',
      pagePath: '/projects/hostlet',
      userMessage: 'How does it work?',
      history: [{ role: 'user', content: 'Hello' }],
      sources: [{ title: 'Hostlet', href: '/projects/hostlet' }],
      model: 'gpt-5.6-luna',
      knowledgeVersion: '2026-08-18',
    });

    expect(exchange).toEqual({
      id: expect.any(String),
      startedAt: '2026-08-23T10:00:00.000Z',
    });
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]?.query).toMatch(/INSERT INTO chat_exchanges/);
    expect(db.calls[0]?.query).toContain('request_history');
    expect(db.calls[0]?.query).toContain('knowledge_version');
    expect(db.calls[0]?.values).toEqual([
      exchange.id,
      'visitor-123',
      'beta',
      '/projects/hostlet',
      'How does it work?',
      '[{"role":"user","content":"Hello"}]',
      null,
      '[{"title":"Hostlet","href":"/projects/hostlet"}]',
      'gpt-5.6-luna',
      '2026-08-18',
      'started',
      null,
      '2026-08-23T10:00:00.000Z',
      null,
      null,
    ]);
    expect(db.calls[0]?.query).not.toMatch(/ip|user.?agent|secret/i);
  });

  it('finalizes an exchange with status, safe error code, timestamp, and duration', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-23T10:00:00.000Z'));
    const db = new FakeDatabase();
    const exchange = await startChatExchange(db, {
      visitorId: 'visitor-123',
      pagePath: '/',
      userMessage: 'Hi',
      history: [],
    });

    vi.setSystemTime(new Date('2026-08-23T10:00:01.250Z'));
    await finalizeChatExchange(db, exchange, {
      status: 'error',
      assistantMessage: 'Sorry, I could not answer that.',
      errorCode: ' UPSTREAM_ERROR ',
    });

    expect(db.calls).toHaveLength(2);
    expect(db.calls[1]?.query).toMatch(/UPDATE chat_exchanges/);
    expect(db.calls[1]?.values).toEqual([
      'error',
      'Sorry, I could not answer that.',
      'upstream_error',
      '2026-08-23T10:00:01.250Z',
      1250,
      exchange.id,
    ]);
  });

  it('makes a missing database a no-op and keeps a usable handle', async () => {
    const exchange = await startChatExchange(undefined, {
      visitorId: 'visitor-123',
      pagePath: '/',
      userMessage: 'Hi',
    });

    await expect(
      finalizeChatExchange(undefined, exchange, { status: 'aborted' }),
    ).resolves.toBeUndefined();
    expect(exchange.id).toEqual(expect.any(String));
  });

  it('swallows D1 failures in both persistence paths', async () => {
    const db = new FakeDatabase();
    db.fail = true;

    const exchange = await startChatExchange(db, {
      visitorId: 'visitor-123',
      pagePath: '/',
      userMessage: 'Hi',
    });
    expect(exchange).toEqual({ id: expect.any(String), startedAt: expect.any(String) });

    await expect(
      finalizeChatExchange(db, exchange, { status: 'completed', assistantText: 'Done' }),
    ).resolves.toBeUndefined();
  });

  it('rejects unsafe error details instead of persisting them', () => {
    expect(sanitizeErrorCode('upstream_error')).toBe('upstream_error');
    expect(sanitizeErrorCode('  UPSTREAM_ERROR  ')).toBe('upstream_error');
    expect(sanitizeErrorCode('secret=sk-test\nstack')).toBeNull();
    expect(sanitizeErrorCode('x'.repeat(65))).toBeNull();
  });
});
