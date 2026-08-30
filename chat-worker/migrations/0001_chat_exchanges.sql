CREATE TABLE IF NOT EXISTS chat_exchanges (
  id TEXT PRIMARY KEY NOT NULL,
  visitor_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  page_path TEXT NOT NULL,
  user_message TEXT NOT NULL,
  request_history TEXT NOT NULL DEFAULT '[]',
  assistant_message TEXT,
  sources TEXT NOT NULL DEFAULT '[]',
  model TEXT,
  knowledge_version TEXT,
  status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'error', 'aborted')),
  error_code TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_chat_exchanges_visitor_started_at
  ON chat_exchanges (visitor_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_exchanges_status_started_at
  ON chat_exchanges (status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_exchanges_environment_started_at
  ON chat_exchanges (environment, started_at DESC);
