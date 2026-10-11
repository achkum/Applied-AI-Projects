import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { canonicalPrivateSecret, privateBody, privateCookies, rawHeader, privateEnrollmentFailure } from './private-enrollment-http.js';

function request(body: string, cookie?: string): IncomingMessage {
  const stream = Readable.from([Buffer.from(body, 'utf8')]) as IncomingMessage;
  stream.rawHeaders = ['Content-Length', String(Buffer.byteLength(body)), ...(cookie ? ['Cookie', cookie] : [])];
  return stream;
}
describe('private enrollment raw wire decoder', () => {
  it('rejects duplicate and trailing JSON members before authority work', async () => {
    await expect(privateBody(request('{"transport":"web","transport":"web"}'))).rejects.toThrow();
    await expect(privateBody(request('{}x'))).rejects.toThrow();
    await expect(privateBody(request('{"transport":"web"}'))).resolves.toEqual({ transport: 'web' });
  });
  it('rejects duplicated or malformed raw cookies and headers', () => {
    expect(() => privateCookies(request('{}', 'st_v2_binding=a; st_v2_binding=a'))).toThrow();
    const duplicate = request('{}'); duplicate.rawHeaders.push('Origin', 'a', 'origin', 'a');
    expect(() => rawHeader(duplicate, 'origin')).toThrow();
    expect(canonicalPrivateSecret(Buffer.alloc(32, 1).toString('base64url'))).toBe(true);
    expect(canonicalPrivateSecret('a'.repeat(42) + '/')).toBe(false);
  });
});


describe('private enrollment trusted failure boundary', () => {
  it('preserves deliberately collapsed durable uncertainty without classifying sensitive causes', () => {
    expect(privateEnrollmentFailure(new Error('AUTH_RESTART_REQUIRED'))).toEqual({status:409,loginRequired:false});
    expect(privateEnrollmentFailure(new Error('ENROLLMENT_LOGIN_REQUIRED'))).toEqual({status:409,loginRequired:true});
    expect(privateEnrollmentFailure(new Error('wire'))).toEqual({status:400,loginRequired:false});
  });
  it('does not turn unexpected adapter or token-issuer faults into a replay conflict', () => {
    for (const error of [new Error('dependency failure'), new TypeError(), null, {message:'AUTH_RESTART_REQUIRED'}])
      expect(privateEnrollmentFailure(error)).toEqual({status:500,loginRequired:false});
  });
});
