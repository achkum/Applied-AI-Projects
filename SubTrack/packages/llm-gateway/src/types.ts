export type LlmProvider = 'gemini' | 'groq' | 'openrouter' | 'template';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  provider: LlmProvider;
  model: string;
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
  bypassCache?: boolean;
}

export interface LlmUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface LlmResponse {
  content: string;
  model: string;
  provider: LlmProvider;
  usage?: LlmUsage;
  cached: boolean;
  latencyMs: number;
}

export interface LlmGatewayConfig {
  geminiApiKey?: string;
  groqApiKey?: string;
  openrouterApiKey?: string;
  cache?: CacheConfig;
  rateLimits?: Partial<Record<LlmProvider, RateLimitConfig>>;
}

export interface CacheConfig {
  maxSize?: number;
  ttlMs?: number;
}

export interface RateLimitConfig {
  requestsPerMinute: number;
}
