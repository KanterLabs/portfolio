import { KNOWLEDGE_VERSION, retrieveKnowledge, sourceRefs } from './knowledge.ts';
import { finalizeChatExchange, startChatExchange, type ChatExchangeHandle } from './history.ts';
import { DEFAULT_MODEL, SYSTEM_INSTRUCTIONS, buildPromptInput } from './prompt.ts';
import { createErrorStream, transformUpstreamSse } from './sse.ts';
import { isAllowedOrigin, parseChatRequest } from './validation.ts';
import type { ChatRequest, Env, SourceRef } from './types.ts';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

const STREAM_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-store, no-transform',
  'X-Content-Type-Options': 'nosniff',
  Connection: 'keep-alive',
};

export const UPSTREAM_TIMEOUT_MS = 30_000;

function jsonResponse(body: unknown, status = 200, origin?: string): Response {
  const headers = new Headers(JSON_HEADERS);
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function methodNotAllowed(allow: string, origin?: string): Response {
  const response = jsonResponse(
    { error: { code: 'method_not_allowed', message: 'Method not allowed.' } },
    405,
    origin,
  );
  response.headers.set('Allow', allow);
  return response;
}

function notFound(): Response {
  return jsonResponse({ error: { code: 'not_found', message: 'Not found.' } }, 404);
}

function streamResponse(
  stream: ReadableStream<Uint8Array>,
  status: number,
  origin?: string,
): Response {
  const headers = new Headers(STREAM_HEADERS);
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  return new Response(stream, { status, headers });
}

function validationResponse(
  code: string,
  status: number,
  origin?: string,
  sources: SourceRef[] = [],
): Response {
  return streamResponse(createErrorStream(sources, code), status, origin);
}

function healthResponse(env: Env): Response {
  return jsonResponse({
    status: 'ok',
    service: 'portfolio-chat',
    environment: env.APP_ENV ?? 'unknown',
    knowledgeVersion: KNOWLEDGE_VERSION,
    configured: Boolean(env.OPENAI_API_KEY?.trim()),
    historyConfigured: Boolean(env.CHAT_HISTORY),
  });
}

function openAiPayload(request: ChatRequest, selectedEntries: ReturnType<typeof retrieveKnowledge>, env: Env) {
  return {
    model: env.OPENAI_MODEL ?? DEFAULT_MODEL,
    instructions: SYSTEM_INSTRUCTIONS,
    input: buildPromptInput(request, selectedEntries),
    stream: true,
    reasoning: { effort: 'low' },
    text: { verbosity: 'low' },
    max_output_tokens: 350,
    store: false,
    safety_identifier: request.visitorId,
  };
}

function finishExchange(
  ctx: ExecutionContext,
  env: Env,
  exchange: ChatExchangeHandle,
  status: 'completed' | 'error' | 'aborted',
  assistantMessage: string | null = null,
  errorCode?: string,
): void {
  const persistence = finalizeChatExchange(env.CHAT_HISTORY, exchange, {
    status,
    assistantMessage,
    errorCode,
  });
  if (typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(persistence);
  }
}

async function chatResponse(
  httpRequest: Request,
  request: ChatRequest,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const selectedEntries = retrieveKnowledge(request.message, request.pagePath);
  const sources = sourceRefs(selectedEntries);
  const origin = env.ALLOWED_ORIGIN;
  const exchange = await startChatExchange(env.CHAT_HISTORY, {
    visitorId: request.visitorId,
    environment: env.APP_ENV,
    pagePath: request.pagePath,
    userMessage: request.message,
    history: request.history,
    sources,
    model: env.OPENAI_MODEL ?? DEFAULT_MODEL,
    knowledgeVersion: KNOWLEDGE_VERSION,
  });

  if (!env.OPENAI_API_KEY?.trim()) {
    finishExchange(ctx, env, exchange, 'error', null, 'not_configured');
    return validationResponse('not_configured', 503, origin, sources);
  }
  if ((env.OPENAI_MODEL ?? DEFAULT_MODEL) !== DEFAULT_MODEL) {
    finishExchange(ctx, env, exchange, 'error', null, 'configuration_error');
    return validationResponse('configuration_error', 500, origin, sources);
  }

  const abortController = new AbortController();
  const abortFromClient = () => abortController.abort();
  const timeout = setTimeout(() => abortController.abort(), UPSTREAM_TIMEOUT_MS);
  httpRequest.signal.addEventListener('abort', abortFromClient, { once: true });
  const cleanupAbort = () => {
    clearTimeout(timeout);
    httpRequest.signal.removeEventListener('abort', abortFromClient);
  };

  let upstream: Response;
  try {
    upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(openAiPayload(request, selectedEntries, env)),
      signal: abortController.signal,
    });
  } catch {
    cleanupAbort();
    finishExchange(ctx, env, exchange, 'error', null, 'upstream_error');
    return validationResponse('upstream_error', 502, origin, sources);
  }

  if (!upstream.ok || !upstream.body) {
    cleanupAbort();
    await upstream.body?.cancel();
    finishExchange(ctx, env, exchange, 'error', null, 'upstream_error');
    return validationResponse('upstream_error', 502, origin, sources);
  }

  return streamResponse(
    transformUpstreamSse(upstream.body, sources, {
      onFinished: ({ reason, text }) => {
        cleanupAbort();
        finishExchange(
          ctx,
          env,
          exchange,
          reason,
          text || null,
          reason === 'error' ? 'upstream_error' : undefined,
        );
      },
    }),
    200,
    origin,
  );
}

export async function handleRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/chat/health') {
    return request.method === 'GET' ? healthResponse(env) : methodNotAllowed('GET');
  }
  if (url.pathname !== '/api/chat') {
    return notFound();
  }
  if (request.method !== 'POST') {
    return methodNotAllowed('POST');
  }

  const allowedOrigin = isAllowedOrigin(request, env) ? request.headers.get('origin') ?? undefined : undefined;
  if (!allowedOrigin) {
    return validationResponse('origin_not_allowed', 403);
  }

  const parsed = await parseChatRequest(request);
  if (!parsed.ok) {
    return validationResponse(parsed.issue.code, parsed.issue.status, allowedOrigin);
  }

  return chatResponse(request, parsed.value, env, ctx);
}

const worker = {
  fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    return handleRequest(request, env, _ctx);
  },
};

export default worker;
