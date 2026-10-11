import { describe, expect, it } from 'vitest';
import { hashDurableSessionCsrf, mintDurableSessionCsrf } from './durable-session-csrf.js';

describe('durable CSRF digest', () => {
  it('mints distinct canonical secrets and stores only a domain-separated digest', () => {
    const first = mintDurableSessionCsrf();
    const second = mintDurableSessionCsrf();
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.token).not.toBe(second.token);
    expect(first.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(first.digest).toBe(hashDurableSessionCsrf(first.token));
    expect(first.digest).not.toBe(first.token);
    expect(first.digest).not.toBe(hashDurableSessionCsrf(second.token));
  });

  it.each(['', 'x'.repeat(43), 'a'.repeat(44), 'a'.repeat(42) + '=', 'ä'.repeat(43)])(
    'rejects noncanonical or wrong-length token %s', (token) => {
      expect(() => hashDurableSessionCsrf(token)).toThrow('Session CSRF unavailable');
    },
  );
});
