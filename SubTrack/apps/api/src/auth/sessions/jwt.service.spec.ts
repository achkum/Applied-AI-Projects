import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { JwtService } from './jwt.service';

describe('JwtService', () => {
  let svc: JwtService;
  let fixturePrivateKey: string;

  beforeEach(() => {
    const pair = generateKeyPairSync('ed25519');
    fixturePrivateKey = pair.privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString();
    vi.stubEnv('JWT_PRIVATE_KEY_PEM', fixturePrivateKey);
    svc = new JwtService();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  function signedPayload(json: string): string {
    const header = Buffer.from(
      JSON.stringify({ alg: 'EdDSA', crv: 'Ed25519', typ: 'JWT' }),
    ).toString('base64url');
    const payload = Buffer.from(json).toString('base64url');
    const message = Buffer.from(`${header}.${payload}`);
    const signature = sign(null, message, fixturePrivateKey).toString(
      'base64url',
    );
    return `${header}.${payload}.${signature}`;
  }

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

  it.each(['null', '[]', '"text"', '42'])(
    'verify rejects signed non-object payload %s',
    (json) => {
      expect(() => svc.verify(signedPayload(json))).toThrow(
        'JWT payload must be a plain object.',
      );
    },
  );

  it.each([
    '{}',
    '{"sid":"session-1","iat":100,"exp":200}',
    '{"sub":"identity-1","iat":100,"exp":200}',
    '{"sub":"identity-1","sid":"session-1","exp":200}',
    '{"sub":"identity-1","sid":"session-1","iat":100}',
    '{"sub":"","sid":"session-1","iat":100,"exp":200}',
    '{"sub":"  ","sid":"session-1","iat":100,"exp":200}',
    '{"sub":"identity-1","sid":"","iat":100,"exp":200}',
    '{"sub":"identity-1","sid":"  ","iat":100,"exp":200}',
    '{"sub":1,"sid":"session-1","iat":100,"exp":200}',
    '{"sub":"identity-1","sid":true,"iat":100,"exp":200}',
    '{"sub":"identity-1","sid":"session-1","iat":"100","exp":200}',
    '{"sub":"identity-1","sid":"session-1","iat":100,"exp":"200"}',
    '{"sub":"identity-1","sid":"session-1","iat":true,"exp":200}',
    '{"sub":"identity-1","sid":"session-1","iat":100,"exp":false}',
    '{"sub":"identity-1","sid":"session-1","iat":100.5,"exp":200}',
    '{"sub":"identity-1","sid":"session-1","iat":100,"exp":200.5}',
    '{"sub":"identity-1","sid":"session-1","iat":1e999,"exp":200}',
    '{"sub":"identity-1","sid":"session-1","iat":100,"exp":1e999}',
    '{"sub":"identity-1","sid":"session-1","iat":200,"exp":200}',
    '{"sub":"identity-1","sid":"session-1","iat":201,"exp":200}',
  ])('verify rejects signed invalid claims %s', (json) => {
    vi.setSystemTime(150_000);
    expect(() => svc.verify(signedPayload(json))).toThrow(
      'JWT payload has invalid claims.',
    );
  });

  it('verify accepts signed well-typed unexpired claims', () => {
    const now = Math.floor(Date.now() / 1_000);
    const token = signedPayload(
      JSON.stringify({
        sub: 'identity-1',
        sid: 'session-1',
        iat: now,
        exp: now + 60,
      }),
    );
    expect(svc.verify(token)).toEqual({
      sub: 'identity-1',
      sid: 'session-1',
      iat: now,
      exp: now + 60,
    });
  });

  it('token from one JwtService instance cannot be verified by another', () => {
    vi.stubEnv('JWT_PRIVATE_KEY_PEM', undefined);
    const other = new JwtService(); // different key pair (dev fallback)
    vi.stubEnv('JWT_PRIVATE_KEY_PEM', fixturePrivateKey);
    const token = svc.issue('identity-1', 'session-1');
    expect(() => other.verify(token)).toThrow();
  });
});
