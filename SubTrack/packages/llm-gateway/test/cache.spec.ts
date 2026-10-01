import { describe, it, expect } from 'vitest';
import { LlmCache } from '../src/cache.js';
import type { LlmRequest, LlmResponse } from '../src/types.js';

function makeRequest(model: string, content = 'Hello'): LlmRequest {
  return {
    provider: 'template',
    model,
    messages: [{ role: 'user', content }],
  };
}

function makeResponse(model: string): LlmResponse {
  return {
    content: `Response for ${model}`,
    model,
    provider: 'template',
    cached: false,
    latencyMs: 10,
  };
}

describe('LlmCache', () => {
  it('returns undefined for an unknown request', () => {
    const cache = new LlmCache();
    expect(cache.get(makeRequest('model-a'))).toBeUndefined();
  });

  it('returns a cached response after set', () => {
    const cache = new LlmCache();
    const req = makeRequest('model-a');
    const res = makeResponse('model-a');
    cache.set(req, res);
    const hit = cache.get(req);
    expect(hit).toBeDefined();
    expect(hit?.content).toBe(res.content);
  });

  it('cached response has cached=true and latencyMs=0', () => {
    const cache = new LlmCache();
    const req = makeRequest('model-b');
    cache.set(req, makeResponse('model-b'));
    const hit = cache.get(req);
    expect(hit?.cached).toBe(true);
    expect(hit?.latencyMs).toBe(0);
  });

  it('returns undefined after TTL expiry', async () => {
    const cache = new LlmCache({ ttlMs: 1 });
    const req = makeRequest('model-ttl');
    cache.set(req, makeResponse('model-ttl'));
    await new Promise((r) => setTimeout(r, 10));
    expect(cache.get(req)).toBeUndefined();
  });

  it('evicts oldest entry when maxSize is exceeded', () => {
    const cache = new LlmCache({ maxSize: 2 });
    const req1 = makeRequest('m1');
    const req2 = makeRequest('m2');
    const req3 = makeRequest('m3');
    cache.set(req1, makeResponse('m1'));
    cache.set(req2, makeResponse('m2'));
    cache.set(req3, makeResponse('m3'));
    // req1 should have been evicted
    expect(cache.get(req1)).toBeUndefined();
    expect(cache.get(req2)).toBeDefined();
    expect(cache.get(req3)).toBeDefined();
  });

  it('clear() empties the cache', () => {
    const cache = new LlmCache();
    cache.set(makeRequest('m-clear'), makeResponse('m-clear'));
    expect(cache.size).toBe(1);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('different models produce different cache keys (no cross-hit)', () => {
    const cache = new LlmCache();
    cache.set(makeRequest('model-x'), makeResponse('model-x'));
    expect(cache.get(makeRequest('model-y'))).toBeUndefined();
  });

  it('same request content produces a cache hit', () => {
    const cache = new LlmCache();
    const req = makeRequest('model-same');
    cache.set(req, makeResponse('model-same'));
    const reqCopy = makeRequest('model-same');
    expect(cache.get(reqCopy)).toBeDefined();
  });

  it('size reflects number of stored entries', () => {
    const cache = new LlmCache();
    expect(cache.size).toBe(0);
    cache.set(makeRequest('s1'), makeResponse('s1'));
    cache.set(makeRequest('s2'), makeResponse('s2'));
    expect(cache.size).toBe(2);
  });
});
