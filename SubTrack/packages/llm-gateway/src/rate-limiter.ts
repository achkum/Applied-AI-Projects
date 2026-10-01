import type { LlmProvider, RateLimitConfig } from './types.js';

interface Bucket {
  tokens: number;
  lastRefill: number;
  refillRate: number; // tokens per ms
  maxTokens: number;
}

export class RateLimiter {
  private readonly buckets: Map<LlmProvider, Bucket> = new Map();

  constructor(limits: Partial<Record<LlmProvider, RateLimitConfig>> = {}) {
    for (const [provider, cfg] of Object.entries(limits) as [
      LlmProvider,
      RateLimitConfig,
    ][]) {
      const refillRate = cfg.requestsPerMinute / 60_000;
      this.buckets.set(provider, {
        tokens: cfg.requestsPerMinute,
        lastRefill: Date.now(),
        refillRate,
        maxTokens: cfg.requestsPerMinute,
      });
    }
  }

  tryConsume(provider: LlmProvider): boolean {
    const bucket = this.buckets.get(provider);
    if (!bucket) return true;

    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    bucket.tokens = Math.min(
      bucket.tokens + elapsed * bucket.refillRate,
      bucket.maxTokens,
    );
    bucket.lastRefill = now;

    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }
}
