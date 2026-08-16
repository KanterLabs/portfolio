export type ChatRole = 'user' | 'assistant';

export interface ChatHistoryMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  message: string;
  history: ChatHistoryMessage[];
  pagePath: string;
  visitorId: string;
}

export interface SourceRef {
  title: string;
  href: string;
}

export interface KnowledgeSource {
  title: string;
  path: string;
  href: string;
}

export interface KnowledgeEntry {
  id: string;
  source: KnowledgeSource;
  lastReviewed: string;
  topics: string[];
  keywords: string[];
  content: string;
}

export interface KnowledgeDocument {
  version: string;
  entries: KnowledgeEntry[];
}

export interface Env {
  APP_ENV?: string;
  ALLOWED_ORIGIN?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  KNOWLEDGE_VERSION?: string;
}
