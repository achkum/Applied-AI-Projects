import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtService } from './jwt.service';

describe('JwtService', () => {
  let svc: JwtService;

  beforeEach(() => {
    delete process.env['JWT_PRIVATE_KEY_PEM'];
    svc = new JwtService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('issues a JWT with three dot-separated parts', () => {
    const token = svc.issue('identity-1', 'session-1');
    expect(token.split('.')).toHaveLength(3);
  });

  it('verify returns the correct claims', () => {
    const token = svc.issue('identity-1', 'session-1');
    const claims = svc.verify(token);
    expect(claims.sub).toBe('identity-1');
    expect(claims.sid).toBe('session-1');
    expect(claims.iat).toBeGreaterThan(0);
    expect(claims.exp).toBe(claims.iat + 15 * 60);
  });

  it('verify rejects a tampered payload', () => {
    const token = svc.issue('identity-1', 'session-1');
    const parts = token.split('.');
    // Replace payload with a different (valid base64url) payload
    const badPayload = Buffer.from(
      JSON.stringify({ sub: 'attacker', sid: 'x', iat: 1, exp: 9999999999 }),
    ).toString('base64url');
    const tampered = `${parts[0]}.${badPayload}.${parts[2]}`;
    expect(() => svc.verify(tampered)).toThrow();
  });

  it('verify rejects a malformed token (not 3 parts)', () => {
    expect(() => svc.verify('not.a.valid.jwt')).toThrow('Malformed JWT');
    expect(() => svc.verify('twosections')).toThrow('Malformed JWT');
  });

  it('verify rejects an expired token', () => {
    const fixedNow = new Date('2026-10-01T12:00:00Z').getTime();
    vi.setSystemTime(fixedNow);
    const token = svc.issue('identity-1', 'session-1');

    // Advance 16 minutes (past 15-min TTL)
    vi.setSystemTime(fixedNow + 16 * 60 * 1_000);
    expect(() => svc.verify(token)).toThrow('JWT has expired.');
  });

  it('token from one JwtService instance cannot be verified by another', () => {
    const other = new JwtService(); // different key pair (dev fallback)
    const token = svc.issue('identity-1', 'session-1');
    expect(() => other.verify(token)).toThrow();
  });
});
