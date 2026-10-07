import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { V2AccessToken, type V2AccessTokenConfig } from './v2-access-token.js';

const subject = '8b9cf147-7fe5-4abe-89aa-9d1eb1cc8012';
const session = 'd49bb51b-ffb7-40d8-9774-6551bd001b29';
const fixedNow = 1_800_000_000_000;
const pair = () => generateKeyPairSync('ed25519');
const config = (keys = pair(), clock: () => number = () => fixedNow): V2AccessTokenConfig => ({
  environment: 'development', enabled: true, privateKey: keys.privateKey, publicKey: keys.publicKey, clock,
});
const parts = (token: string): string[] => token.split('.');
const b64 = (text: string): string => Buffer.from(text, 'utf8').toString('base64url');
const signed = (keys: ReturnType<typeof pair>, header: string, payload: string): string => {
  const input = `${b64(header)}.${b64(payload)}`;
  return `${input}.${sign(null, Buffer.from(input, 'ascii'), keys.privateKey).toString('base64url')}`;
};
const goodPayload = (changes: Record<string, unknown> = {}): string => JSON.stringify({
  iss: 'urn:subtrack:auth:v2:development', aud: 'urn:subtrack:api:v2:development',
  sub: subject, sid: session, iat: fixedNow / 1000, exp: fixedNow / 1000 + 900, ver: 2, ...changes,
});
const goodHeader = JSON.stringify({ alg: 'EdDSA', typ: 'subtrack-v2-access+jwt' });

describe('V2AccessToken', () => {
  it('issues and verifies a minimal frozen v2 credential', () => {
    const tokens = new V2AccessToken(config());
    const claims = tokens.verify(tokens.issue(subject, session));
    expect(claims).toEqual({ iss: 'urn:subtrack:auth:v2:development', aud: 'urn:subtrack:api:v2:development', sub: subject, sid: session, iat: fixedNow / 1000, exp: fixedNow / 1000 + 900, ver: 2 });
    expect(Object.isFrozen(claims)).toBe(true);
  });

  it('rejects mismatched keys, key roles, config extras, and non-development mode', () => {
    const first = pair(); const second = pair();
    expect(() => new V2AccessToken(config({ ...first, publicKey: second.publicKey }))).toThrow('Invalid access token');
    expect(() => new V2AccessToken(config({ privateKey: first.publicKey, publicKey: first.publicKey } as never))).toThrow('Invalid access token');
    expect(() => new V2AccessToken({ ...config(first), environment: 'production' } as never)).toThrow('Invalid access token');
    expect(() => new V2AccessToken({ ...config(first), extra: true } as never)).toThrow('Invalid access token');
    let getterCalled = false;
    const getterConfig = { ...config(first), get enabled() { getterCalled = true; return true as const; } };
    expect(() => new V2AccessToken(getterConfig)).toThrow('Invalid access token');
    expect(getterCalled).toBe(false);
    const hidden = { ...config(first) } as Record<string, unknown>;
    Object.defineProperty(hidden, 'hidden', { value: 1 });
    expect(() => new V2AccessToken(hidden as never)).toThrow('Invalid access token');
    expect(() => new V2AccessToken(Object.assign(Object.create(null) as object, config(first)) as never)).toThrow('Invalid access token');
    expect(() => new V2AccessToken({ ...config(first), privateKey: {} } as never)).toThrow('Invalid access token');
    expect(() => new V2AccessToken({ ...config(first), enabled: false } as never)).toThrow('Invalid access token');
    expect(() => new V2AccessToken({ ...config(first), [Symbol('extra')]: 1 } as never)).toThrow('Invalid access token');
  });

  it('rejects malformed IDs and invalid clocks without exposing detail', () => {
    const tokens = new V2AccessToken(config());
    expect(() => tokens.issue('not-an-id', session)).toThrow('Invalid access token');
    for (const clock of [() => -1, () => Number.MAX_SAFE_INTEGER + 1, () => { throw new Error('secret detail'); }]) {
      expect(() => new V2AccessToken(config(pair(), clock)).issue(subject, session)).toThrow('Invalid access token');
    }
  });

  it('rejects v1-shaped JWTs even with the same fixture key', () => {
    const keys = pair();
    const tokens = new V2AccessToken(config(keys));
    const v1 = signed(keys, JSON.stringify({ alg: 'EdDSA', typ: 'JWT' }), JSON.stringify({ sub: subject, sid: session }));
    expect(() => tokens.verify(v1)).toThrow('Invalid access token');
  });

  it('rejects wrong keys, header, namespace, version, and noncanonical JSON', () => {
    const keys = pair(); const other = pair(); const tokens = new V2AccessToken(config(keys));
    expect(() => tokens.verify(signed(other, goodHeader, goodPayload()))).toThrow('Invalid access token');
    for (const header of [JSON.stringify({ alg: 'none', typ: 'subtrack-v2-access+jwt' }), JSON.stringify({ alg: 'EdDSA', typ: 'subtrack-v2-access+jwt', kid: 'x' })]) {
      expect(() => tokens.verify(signed(keys, header, goodPayload()))).toThrow('Invalid access token');
    }
    for (const payload of [goodPayload({ iss: 'urn:other' }), goodPayload({ aud: 'urn:other' }), goodPayload({ ver: 1 }), goodPayload({ extra: true }), goodPayload({ sub: 'A' }),
      JSON.stringify({ iss: 'urn:subtrack:auth:v2:development', aud: 'urn:subtrack:api:v2:development', sid: session, iat: fixedNow / 1000, exp: fixedNow / 1000 + 900, ver: 2 }),
      goodPayload({ iat: -1, exp: 899 }), goodPayload({ iat: Number.MAX_SAFE_INTEGER, exp: Number.MAX_SAFE_INTEGER + 900 })]) {
      expect(() => tokens.verify(signed(keys, goodHeader, payload))).toThrow('Invalid access token');
    }
    expect(() => tokens.verify(signed(keys, '{ "alg":"EdDSA","typ":"subtrack-v2-access+jwt" }', goodPayload()))).toThrow('Invalid access token');
  });

  it('rejects duplicate header and payload keys before accepting parsed values', () => {
    const keys = pair(); const tokens = new V2AccessToken(config(keys));
    expect(() => tokens.verify(signed(keys, '{"alg":"none","alg":"EdDSA","typ":"subtrack-v2-access+jwt"}', goodPayload()))).toThrow('Invalid access token');
    expect(() => tokens.verify(signed(keys, goodHeader, goodPayload().replace('"ver":2', '"ver":1,"ver":2')))).toThrow('Invalid access token');
  });

  it('enforces the exact TTL and time boundaries', () => {
    const keys = pair(); const tokens = new V2AccessToken(config(keys));
    for (const payload of [goodPayload({ exp: fixedNow / 1000 + 901 }), goodPayload({ iat: fixedNow / 1000 + 1, exp: fixedNow / 1000 + 901 })]) {
      expect(() => tokens.verify(signed(keys, goodHeader, payload))).toThrow('Invalid access token');
    }
    const boundary = new V2AccessToken(config(keys, () => fixedNow + 900_000));
    expect(() => boundary.verify(signed(keys, goodHeader, goodPayload()))).toThrow('Invalid access token');
    const valid = new V2AccessToken(config(keys, () => fixedNow + 899_999));
    expect(valid.verify(signed(keys, goodHeader, goodPayload())).exp).toBe(fixedNow / 1000 + 900);
    expect(() => new V2AccessToken(config(keys, () => { throw new Error('clock secret'); })).verify(tokens.issue(subject, session))).toThrow('Invalid access token');
  });

  it('rejects malformed segments, noncanonical base64url, oversized tokens, and tampering', () => {
    const keys = pair(); const tokens = new V2AccessToken(config(keys)); const token = tokens.issue(subject, session); const segs = parts(token);
    for (const bad of ['x', `${segs[0]}.${segs[1]}`, `${segs[0]}=.${segs[1]}.${segs[2]}`, `${segs[0]}.${segs[1]}.${segs[2]}!`, `${token}x`, 'a'.repeat(4097)]) {
      expect(() => tokens.verify(bad)).toThrow('Invalid access token');
    }
    const changedSignature = `${segs[2]![0] === 'A' ? 'B' : 'A'}${segs[2]!.slice(1)}`;
    expect(() => tokens.verify(`${segs[0]}.${segs[1]}.${changedSignature}`)).toThrow('Invalid access token');
    expect(() => tokens.verify(`${segs[0]}.${segs[1]}.${b64('short')}`)).toThrow('Invalid access token');
    const invalidUtf8 = `${b64(goodHeader)}.${Buffer.from([0xc3, 0x28]).toString('base64url')}.${segs[2]}`;
    expect(() => tokens.verify(invalidUtf8)).toThrow('Invalid access token');
  });
});
