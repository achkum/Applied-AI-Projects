import type { LlmRequest, LlmResponse, CacheConfig } from './types.js';
import { createHash } from 'node:crypto';

function cacheKey(request: LlmRequest): string {
  const payload = JSON.stringify({
    provider: request.provider,
    model: request.model,
    messages: request.messages,
    temperature: request.temperature ?? null,
    maxTokens: request.maxTokens ?? null,
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

interface CacheEntry {
  response: LlmResponse;
  expiresAt: number;
}

export class LlmCache {
  private readonly store: Map<string, CacheEntry>;
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(config: CacheConfig = {}) {
    this.maxSize = config.maxSize ?? 256;
    this.ttlMs = config.ttlMs ?? 5 * 60 * 1000;
    this.store = new Map();
  }

  get(request: LlmRequest): LlmResponse | undefined {
    const key = cacheKey(request);
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    // Move to end for LRU
    this.store.delete(key);
    this.store.set(key, entry);
    return { ...entry.response, cached: true, latencyMs: 0 };
  }

  set(request: LlmRequest, response: LlmResponse): void {
    const key = cacheKey(request);
    if (this.store.size >= this.maxSize) {
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) this.store.delete(firstKey);
    }
    this.store.set(key, { response, expiresAt: Date.now() + this.ttlMs });
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}
