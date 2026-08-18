import { describe, expect, it } from 'vitest';
import { SseParser, transformUpstreamSse } from '../src/sse.ts';

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

function parsePublicEvents(text: string): Array<{ event: string; data: unknown }> {
  return text
    .trim()
    .split('\n\n')
    .map((block) => {
      const lines = block.split('\n');
      const event = lines.find((line) => line.startsWith('event: '))?.slice(7) ?? '';
      const data = lines.find((line) => line.startsWith('data: '))?.slice(6) ?? '{}';
      return { event, data: JSON.parse(data) };
    });
}

describe('SSE handling', () => {
  it('parses events split across arbitrary chunk boundaries', () => {
    const parser = new SseParser();
    expect(parser.feed('event: response.output_text.de')).toEqual([]);
    expect(parser.feed('lta\ndata: {"type":"response.output_text.delta",')).toEqual([]);
    expect(parser.feed('"delta":"hi"}\n\n')).toEqual([
      {
        event: 'response.output_text.delta',
        data: '{"type":"response.output_text.delta","delta":"hi"}',
      },
    ]);
  });

  it('forwards only text deltas and hides reasoning/upstream details', async () => {
    const upstream = streamFromChunks([
      'event: response.reasoning_summary_text.delta\ndata: {"type":"response.reasoning_summary_text.delta","delta":"secret thought"}\n\n',
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Hel',
      'lo"}\n\n',
      'event: response.completed\ndata: {"type":"response.completed"}\n\n',
    ]);

    const response = new Response(transformUpstreamSse(upstream, [{ title: 'Home', href: '/' }]));
    const events = parsePublicEvents(await response.text());
    expect(events).toEqual([
      { event: 'sources', data: { sources: [{ title: 'Home', href: '/' }] } },
      { event: 'delta', data: { delta: 'Hello' } },
      { event: 'done', data: { reason: 'completed' } },
    ]);
  });

  it('waits for response completion after an output item completes', async () => {
    let canceled = false;
    const encoder = new TextEncoder();
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'event: response.output_text.done\ndata: {"type":"response.output_text.done"}\n\n' +
              'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"still going"}\n\n' +
              'event: response.completed\ndata: {"type":"response.completed"}\n\n',
          ),
        );
      },
      cancel() {
        canceled = true;
      },
    });

    const response = new Response(transformUpstreamSse(upstream, []));
    const events = parsePublicEvents(await response.text());
    expect(events.map(({ event }) => event)).toEqual(['sources', 'delta', 'done']);
    expect(events[1]?.data).toEqual({ delta: 'still going' });
    expect(canceled).toBe(true);
  });

  it('sanitises upstream errors and still closes the stream', async () => {
    const upstream = streamFromChunks([
      'event: error\ndata: {"type":"error","message":"secret provider details"}\n\n',
    ]);
    const response = new Response(transformUpstreamSse(upstream, []));
    const text = await response.text();
    const events = parsePublicEvents(text);

    expect(events).toEqual([
      { event: 'sources', data: { sources: [] } },
      { event: 'error', data: { code: 'upstream_error', message: 'Chat is temporarily unavailable.' } },
      { event: 'done', data: { reason: 'error' } },
    ]);
    expect(text).not.toContain('secret provider details');
  });

  it('treats malformed upstream error frames as sanitized errors', async () => {
    const response = new Response(
      transformUpstreamSse(streamFromChunks(['event: error\ndata: not-json\n\n']), []),
    );
    const events = parsePublicEvents(await response.text());
    expect(events.map(({ event }) => event)).toEqual(['sources', 'error', 'done']);
  });

  it('treats an unexpected upstream EOF as an error instead of a completed answer', async () => {
    const response = new Response(
      transformUpstreamSse(
        streamFromChunks([
          'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"partial"}\n\n',
        ]),
        [],
      ),
    );
    const events = parsePublicEvents(await response.text());

    expect(events).toEqual([
      { event: 'sources', data: { sources: [] } },
      { event: 'delta', data: { delta: 'partial' } },
      { event: 'error', data: { code: 'upstream_error', message: 'Chat is temporarily unavailable.' } },
      { event: 'done', data: { reason: 'error' } },
    ]);
  });
});
