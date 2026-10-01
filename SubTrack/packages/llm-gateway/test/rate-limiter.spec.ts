import { describe, it, expect, vi, afterEach } from 'vitest';
import { RateLimiter } from '../src/rate-limiter.js';

describe('RateLimiter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows all calls when no limits are configured', () => {
    const rl = new RateLimiter();
    for (let i = 0; i < 100; i++) {
      expect(rl.tryConsume('template')).toBe(true);
    }
  });

  it('allows up to requestsPerMinute calls in a fresh bucket', () => {
    const rl = new RateLimiter({ template: { requestsPerMinute: 5 } });
    let allowed = 0;
    for (let i = 0; i < 10; i++) {
      if (rl.tryConsume('template')) allowed++;
    }
    expect(allowed).toBe(5);
  });

  it('returns false once bucket is exhausted', () => {
    const rl = new RateLimiter({ template: { requestsPerMinute: 2 } });
    rl.tryConsume('template');
    rl.tryConsume('template');
    expect(rl.tryConsume('template')).toBe(false);
  });

  it('tokens refill over time', () => {
    vi.useFakeTimers();
    // 60 req/min = 1 token per second
    const rl = new RateLimiter({ template: { requestsPerMinute: 60 } });
    for (let i = 0; i < 60; i++) rl.tryConsume('template');
    expect(rl.tryConsume('template')).toBe(false);
    // Advance system clock by 1000ms → should refill ~1 token
    vi.setSystemTime(Date.now() + 1000);
    expect(rl.tryConsume('template')).toBe(true);
  });

  it('different providers have independent buckets', () => {
    const rl = new RateLimiter({
      template: { requestsPerMinute: 1 },
      gemini: { requestsPerMinute: 10 },
    });
    rl.tryConsume('template'); // exhaust template
    expect(rl.tryConsume('template')).toBe(false);
    expect(rl.tryConsume('gemini')).toBe(true); // gemini unaffected
  });

  it('provider with no limit is independent of a limited one', () => {
    const rl = new RateLimiter({ groq: { requestsPerMinute: 1 } });
    rl.tryConsume('groq');
    rl.tryConsume('groq'); // exhaust groq
    expect(rl.tryConsume('template')).toBe(true); // template has no limit
  });

  it('tryConsume returns a boolean', () => {
    const rl = new RateLimiter({ template: { requestsPerMinute: 10 } });
    const result = rl.tryConsume('template');
    expect(typeof result).toBe('boolean');
  });

  it('multiple providers can be configured simultaneously', () => {
    const rl = new RateLimiter({
      gemini: { requestsPerMinute: 3 },
      groq: { requestsPerMinute: 3 },
      openrouter: { requestsPerMinute: 3 },
    });
    expect(rl.tryConsume('gemini')).toBe(true);
    expect(rl.tryConsume('groq')).toBe(true);
    expect(rl.tryConsume('openrouter')).toBe(true);
  });

  it('unconfigured provider always returns true even alongside configured ones', () => {
    const rl = new RateLimiter({ gemini: { requestsPerMinute: 0 } });
    // gemini at 0 — exhausted immediately
    expect(rl.tryConsume('template')).toBe(true);
    expect(rl.tryConsume('template')).toBe(true);
  });
});
