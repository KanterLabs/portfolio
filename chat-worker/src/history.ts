/**
 * Best-effort persistence for accepted chat exchanges.
 *
 * The chat endpoint must continue to work when the D1 binding is not present
 * (for example, in a local preview) or when D1 is temporarily unavailable.
 * Consequently, both persistence operations deliberately swallow database
 * errors and never make the caller's request fail.
 */

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  run(): Promise<unknown>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
}

export type ChatExchangeTerminalStatus = 'completed' | 'error' | 'aborted';

export interface StartChatExchangeInput {
  visitorId: string;
  environment?: string | null;
  pagePath: string;
  userMessage: string;
  /** The validated history sent by the client. */
  history?: readonly unknown[];
  /** Alias for callers that name the persisted field explicitly. */
  requestHistory?: readonly unknown[];
  sources?: readonly unknown[];
  model?: string | null;
  knowledgeVersion?: string | null;
}

export interface ChatExchangeHandle {
  id: string;
  startedAt: string;
}

export interface FinalizeChatExchangeInput {
  status: ChatExchangeTerminalStatus;
  assistantMessage?: string | null;
  /** Alias for callers that call the generated response text “assistant text”. */
  assistantText?: string | null;
  errorCode?: string | null;
}

const START_EXCHANGE_SQL = `
  INSERT INTO chat_exchanges (
    id,
    visitor_id,
    environment,
    page_path,
    user_message,
    request_history,
    assistant_message,
    sources,
    model,
    knowledge_version,
    status,
    error_code,
    started_at,
    completed_at,
    duration_ms
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const FINALIZE_EXCHANGE_SQL = `
  UPDATE chat_exchanges
  SET status = ?,
      assistant_message = ?,
      error_code = ?,
      completed_at = ?,
      duration_ms = ?
  WHERE id = ?
`;

const ERROR_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/**
 * Keep diagnostic values as short machine-readable codes. In particular, do
 * not accidentally persist an exception message, stack, or upstream payload.
 */
export function sanitizeErrorCode(errorCode: string | null | undefined): string | null {
  if (typeof errorCode !== 'string') {
    return null;
  }

  const normalized = errorCode.trim().toLowerCase();
  return ERROR_CODE_PATTERN.test(normalized) ? normalized : null;
}

function jsonArray(value: readonly unknown[] | undefined): string {
  return JSON.stringify(value ?? []);
}

function durationSince(startedAt: string): number {
  const startedMillis = Date.parse(startedAt);
  if (!Number.isFinite(startedMillis)) {
    return 0;
  }

  return Math.max(0, Date.now() - startedMillis);
}

/**
 * Create an exchange id and attempt to persist its initial `started` row.
 *
 * The returned handle is available to the caller even when `db` is undefined
 * or a D1 operation fails, allowing the request path to remain unaffected.
 */
export async function startChatExchange(
  db: D1DatabaseLike | null | undefined,
  input: StartChatExchangeInput,
): Promise<ChatExchangeHandle> {
  const exchange: ChatExchangeHandle = {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
  };

  if (!db) {
    return exchange;
  }

  try {
    const history = jsonArray(input.requestHistory ?? input.history);
    const sources = jsonArray(input.sources);

    await db
      .prepare(START_EXCHANGE_SQL)
      .bind(
        exchange.id,
        input.visitorId,
        input.environment ?? 'unknown',
        input.pagePath,
        input.userMessage,
        history,
        null,
        sources,
        input.model ?? null,
        input.knowledgeVersion ?? null,
        'started',
        null,
        exchange.startedAt,
        null,
        null,
      )
      .run();
  } catch {
    // History is diagnostic only; a D1 failure must never fail chat.
  }

  return exchange;
}

/**
 * Attempt to finalize an exchange. All database errors are intentionally
 * swallowed so this operation is safe to call from a response/error path.
 */
export async function finalizeChatExchange(
  db: D1DatabaseLike | null | undefined,
  exchange: ChatExchangeHandle,
  input: FinalizeChatExchangeInput,
): Promise<void> {
  if (!db) {
    return;
  }

  try {
    const assistantMessage = input.assistantMessage ?? input.assistantText ?? null;
    const completedAt = new Date().toISOString();

    await db
      .prepare(FINALIZE_EXCHANGE_SQL)
      .bind(
        input.status,
        assistantMessage,
        sanitizeErrorCode(input.errorCode),
        completedAt,
        durationSince(exchange.startedAt),
        exchange.id,
      )
      .run();
  } catch {
    // History is diagnostic only; a D1 failure must never fail chat.
  }
}
