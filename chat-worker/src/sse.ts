import type { SourceRef } from './types.ts';

export interface ParsedSseEvent {
  event: string;
  data: string;
}

export type StreamFinishReason = 'completed' | 'error' | 'aborted';

export interface StreamResult {
  reason: StreamFinishReason;
  text: string;
}

/** Incremental SSE parser that preserves events split at arbitrary chunks. */
export class SseParser {
  private buffer = '';
  private eventName = '';
  private dataLines: string[] = [];

  feed(chunk: string): ParsedSseEvent[] {
    this.buffer += chunk;
    const events: ParsedSseEvent[] = [];

    while (true) {
      const lineBreak = this.buffer.search(/\r\n|\r|\n/);
      if (lineBreak === -1) {
        break;
      }
      const line = this.buffer.slice(0, lineBreak);
      const breakLength = this.buffer.startsWith('\r\n', lineBreak) ? 2 : 1;
      this.buffer = this.buffer.slice(lineBreak + breakLength);
      this.consumeLine(line, events);
    }

    return events;
  }

  end(): ParsedSseEvent[] {
    const events: ParsedSseEvent[] = [];
    if (this.buffer.length > 0) {
      this.consumeLine(this.buffer, events);
      this.buffer = '';
    }
    this.finishEvent(events);
    return events;
  }

  private consumeLine(line: string, events: ParsedSseEvent[]): void {
    if (line.length === 0) {
      this.finishEvent(events);
      return;
    }
    if (line.startsWith(':')) {
      return;
    }

    const separator = line.indexOf(':');
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? '' : line.slice(separator + 1);
    if (value.startsWith(' ')) {
      value = value.slice(1);
    }

    if (field === 'event') {
      this.eventName = value;
    } else if (field === 'data') {
      this.dataLines.push(value);
    }
  }

  private finishEvent(events: ParsedSseEvent[]): void {
    if (this.dataLines.length === 0) {
      this.eventName = '';
      return;
    }
    events.push({
      event: this.eventName || 'message',
      data: this.dataLines.join('\n'),
    });
    this.eventName = '';
    this.dataLines = [];
  }
}

export function encodeSseEvent(event: string, payload: unknown): Uint8Array {
  const body = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  return new TextEncoder().encode(body);
}

export function createErrorStream(
  sources: SourceRef[],
  code: string,
  reason = 'error',
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encodeSseEvent('sources', { sources }));
      controller.enqueue(encodeSseEvent('error', { code, message: 'Chat is temporarily unavailable.' }));
      controller.enqueue(encodeSseEvent('done', { reason }));
      controller.close();
    },
  });
}

function parseEventData(event: ParsedSseEvent): Record<string, unknown> | undefined {
  if (event.data === '[DONE]') {
    return { type: 'response.completed' };
  }
  try {
    const parsed: unknown = JSON.parse(event.data);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function upstreamEventType(event: ParsedSseEvent, data: Record<string, unknown>): string {
  return typeof data.type === 'string' ? data.type : event.event;
}

function upstreamDelta(data: Record<string, unknown>): string | undefined {
  return typeof data.delta === 'string' ? data.delta : undefined;
}

function isCompletion(type: string): boolean {
  // output_text.done only closes one output item. A later output item can
  // still arrive, so wait for the response-level completion event (or the
  // [DONE] sentinel mapped to response.completed above).
  return type === 'response.completed' || type === 'response.done';
}

function isUpstreamError(type: string): boolean {
  return type === 'error' || type === 'response.failed' || type === 'response.incomplete';
}

/**
 * Convert OpenAI's Responses SSE into the intentionally tiny public contract.
 * Reasoning, annotations, tool calls, and all other upstream event types are
 * ignored instead of being forwarded to the browser.
 */
export function transformUpstreamSse(
  upstream: ReadableStream<Uint8Array>,
  sources: SourceRef[],
  options: { onFinished?: (result: StreamResult) => void } = {},
): ReadableStream<Uint8Array> {
  let downstreamCancelRequested = false;
  let activeReader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let completed = false;
      let finished = false;
      let finishReason: StreamFinishReason = 'aborted';
      let outputText = '';
      const parser = new SseParser();
      const decoder = new TextDecoder();
      const reader = upstream.getReader();
      activeReader = reader;

      const finish = () => {
        if (!finished) {
          finished = true;
          options.onFinished?.({ reason: finishReason, text: outputText });
        }
      };
      const enqueue = (chunk: Uint8Array) => {
        if (!downstreamCancelRequested) {
          controller.enqueue(chunk);
        }
      };

      const emitDone = (reason: 'completed' | 'error' | 'aborted') => {
        if (completed) {
          return;
        }
        completed = true;
        finishReason = reason;
        enqueue(encodeSseEvent('done', { reason }));
      };
      const emitError = () => {
        enqueue(
          encodeSseEvent('error', {
            code: 'upstream_error',
            message: 'Chat is temporarily unavailable.',
          }),
        );
      };
      const consume = (event: ParsedSseEvent) => {
        if (event.event === 'error' || event.event === 'response.failed' || event.event === 'response.incomplete') {
          emitError();
          emitDone('error');
          return;
        }
        const data = parseEventData(event);
        if (!data) {
          return;
        }
        const type = upstreamEventType(event, data);
        if (type === 'response.output_text.delta' || type === 'output_text.delta') {
          const delta = upstreamDelta(data);
          if (delta) {
            outputText += delta;
            enqueue(encodeSseEvent('delta', { delta }));
          }
          return;
        }
        if (isCompletion(type)) {
          emitDone('completed');
          return;
        }
        if (isUpstreamError(type)) {
          emitError();
          emitDone('error');
        }
      };

      enqueue(encodeSseEvent('sources', { sources }));
      try {
        while (!completed && !downstreamCancelRequested) {
          const { done, value } = await reader.read();
          if (downstreamCancelRequested) {
            break;
          }
          if (done) {
            for (const event of parser.feed(decoder.decode())) {
              consume(event);
            }
            for (const event of parser.end()) {
              consume(event);
            }
            break;
          }
          const chunk = decoder.decode(value, { stream: true });
          for (const event of parser.feed(chunk)) {
            consume(event);
          }
        }
        if (!completed && !downstreamCancelRequested) {
          // A successful Responses stream ends with a response-level
          // completion event. Treat an early EOF as an upstream failure so a
          // partial answer is never presented as complete.
          emitError();
          emitDone('error');
        }
      } catch {
        if (!completed && !downstreamCancelRequested) {
          emitError();
          emitDone('error');
        }
      } finally {
        try {
          // A response-level completion can arrive before the upstream body
          // closes. Cancel it so the fetch and its reader do not linger.
          await reader.cancel();
        } catch {
          // The upstream may already have closed or been aborted.
        }
        reader.releaseLock();
        activeReader = undefined;
        finish();
        if (!downstreamCancelRequested) {
          controller.close();
        }
      }
    },
    async cancel(reason) {
      // If the browser disconnects, stop consuming OpenAI's body as well.
      // `start` observes this flag and avoids enqueueing into a canceled
      // controller while its pending read resolves.
      downstreamCancelRequested = true;
      try {
        await activeReader?.cancel(reason);
      } catch {
        // The upstream may already have closed or been aborted.
      }
    },
  });
}
