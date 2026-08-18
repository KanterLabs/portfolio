import type { ChatHistoryMessage, ChatRequest, Env } from './types.ts';

export const MAX_BODY_BYTES = 16 * 1024;
export const MAX_MESSAGE_CHARS = 800;
export const MAX_HISTORY_MESSAGES = 6;
export const MAX_HISTORY_CHARS = 800;
export const MAX_PAGE_PATH_CHARS = 256;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_PATH_PATTERN = /^\/[^\s<>{}]*$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

export interface ValidationIssue {
  code:
  | 'body_too_large'
  | 'invalid_content_type'
  | 'invalid_json'
  | 'invalid_body'
  | 'invalid_message'
  | 'message_too_long'
  | 'invalid_history'
  | 'history_too_long'
  | 'history_message_too_long'
  | 'invalid_page_path'
  | 'invalid_visitor_id';
  status: number;
}

export type ValidationResult =
  | { ok: true; value: ChatRequest }
  | { ok: false; issue: ValidationIssue };

const issue = (code: ValidationIssue['code'], status = 400): ValidationResult => ({
  ok: false,
  issue: { code, status },
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function contentLength(request: Request): number | undefined {
  const value = request.headers.get('content-length');
  if (value === null) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : Number.POSITIVE_INFINITY;
}

export function isAllowedOrigin(request: Request, env: Env): boolean {
  const requestOrigin = request.headers.get('origin');
  const allowedOrigin = env.ALLOWED_ORIGIN;
  if (!requestOrigin || !allowedOrigin || requestOrigin === 'null') {
    return false;
  }

  try {
    return new URL(requestOrigin).origin === new URL(allowedOrigin).origin;
  } catch {
    return false;
  }
}

export async function parseChatRequest(request: Request): Promise<ValidationResult> {
  const declaredLength = contentLength(request);
  if (declaredLength !== undefined && declaredLength > MAX_BODY_BYTES) {
    return issue('body_too_large', 413);
  }

  let body: ArrayBuffer;
  try {
    body = await request.arrayBuffer();
  } catch {
    return issue('invalid_body');
  }
  if (body.byteLength > MAX_BODY_BYTES) {
    return issue('body_too_large', 413);
  }

  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    return issue('invalid_content_type', 415);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return issue('invalid_json');
  }
  if (!isRecord(parsed)) {
    return issue('invalid_body');
  }

  const message = parsed.message;
  if (typeof message !== 'string' || message.trim().length === 0) {
    return issue('invalid_message');
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return issue('message_too_long');
  }

  const rawHistory = parsed.history;
  if (rawHistory !== undefined && !Array.isArray(rawHistory)) {
    return issue('invalid_history');
  }
  const history = (rawHistory ?? []) as unknown[];
  if (history.length > MAX_HISTORY_MESSAGES) {
    return issue('history_too_long');
  }

  const validatedHistory: ChatHistoryMessage[] = [];
  for (const item of history) {
    if (!isRecord(item) || (item.role !== 'user' && item.role !== 'assistant')) {
      return issue('invalid_history');
    }
    if (typeof item.content !== 'string' || item.content.trim().length === 0) {
      return issue('invalid_history');
    }
    if (item.content.length > MAX_HISTORY_CHARS) {
      return issue('history_message_too_long');
    }
    validatedHistory.push({
      role: item.role,
      content: item.content.trim(),
    });
  }

  const pagePath = parsed.pagePath;
  if (
    typeof pagePath !== 'string' ||
    pagePath.length === 0 ||
    pagePath.length > MAX_PAGE_PATH_CHARS ||
    !PAGE_PATH_PATTERN.test(pagePath) ||
    CONTROL_CHARACTER_PATTERN.test(pagePath) ||
    pagePath.startsWith('//')
  ) {
    return issue('invalid_page_path');
  }

  const visitorId = parsed.visitorId;
  if (typeof visitorId !== 'string' || !UUID_PATTERN.test(visitorId)) {
    return issue('invalid_visitor_id');
  }

  return {
    ok: true,
    value: {
      message: message.trim(),
      history: validatedHistory,
      pagePath,
      visitorId: visitorId.toLowerCase(),
    },
  };
}
