import { afterEach, describe, expect, it, vi } from 'vitest';
import { startRegistration, verifyRegistration, admitPendingRegistration, verifySimulatorRegistration, completeRegistration } from '../lib/registration-api';

const token = 'A'.repeat(43);
const response = (status: number, body: unknown, media = 'application/json') => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': media } });
const signal = () => new AbortController().signal;
afterEach(() => vi.restoreAllMocks());

describe('private enrollment API', () => {
  it('uses relative v2, rotated nonce, closed responses and fresh keys through completion', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(200, { nonce: token }))
      .mockResolvedValueOnce(response(202, { challengeId: 'challenge', status: 'accepted', nextBrowserNonce: token }))
      .mockResolvedValueOnce(response(200, { purpose: 'enroll_identifier', proof: `v2.${token}`, nextBrowserNonce: token }))
      .mockResolvedValueOnce(response(201, { transport: 'web', continuation: `wep.${token}`, status: 'pending', nextBrowserNonce: token }))
      .mockResolvedValueOnce(response(200, { transport: 'web', verifiedEnrollment: `wev.${token}`, status: 'verified', nextBrowserNonce: token }))
      .mockResolvedValueOnce(response(201, { transport: 'web', sessionId: '123e4567-e89b-42d3-a456-426614174000', csrfToken: 'csrf' }));
    await startRegistration({ channel: 'email', identifier: 'synthetic@example.test' }, signal());
    await verifyRegistration('challenge', '123456', token, signal());
    await admitPendingRegistration(`v2.${token}`, token, signal());
    await verifySimulatorRegistration(`wep.${token}`, token, signal());
    await completeRegistration(`wev.${token}`, token, signal());
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/v2/auth/browser-nonce', '/v2/auth/otp/start', '/v2/auth/otp/verify',
      '/v2/auth/enrollment/pending', '/v2/auth/enrollment/simulator/verify', '/v2/auth/enrollment/complete',
    ]);
    expect(fetchMock.mock.calls.slice(3).map(([, init]) => JSON.parse(init!.body as string))).toEqual([
      { transport: 'web', identifierProof: `v2.${token}` },
      { transport: 'web', continuation: `wep.${token}` },
      { transport: 'web', verifiedEnrollment: `wev.${token}` },
    ]);
    const options = fetchMock.mock.calls.map(([, init]) => init!);
    expect(new Set(options.map((init) => new Headers(init.headers).get('Idempotency-Key'))).size).toBe(6);
    for (const option of options) {
      expect(option.credentials).toBe('include'); expect(option.cache).toBe('no-store');
      expect(new Headers(option.headers).has('Origin')).toBe(false);
    }
  });

  it.each([
    { transport: 'web', continuation: `wev.${token}`, status: 'pending', nextBrowserNonce: token },
    { transport: 'web', continuation: `wep.${token}`, status: 'pending', nextBrowserNonce: token, extra: 1 },
    { transport: 'web', continuation: `wep.${token}`, status: 'pending', nextBrowserNonce: 'short' },
  ])('rejects malformed pending %j', async (body) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(201, body));
    await expect(admitPendingRegistration(`v2.${token}`, token, signal())).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('recognizes only the exact login-required problem and does not replay completion', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(409,
      { type: 'about:blank', title: 'Authentication unavailable', status: 409, code: 'ENROLLMENT_LOGIN_REQUIRED' }, 'application/problem+json'));
    await expect(completeRegistration(`wev.${token}`, token, signal())).rejects.toMatchObject({ code: 'login-required' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects oversized and malformed terminal responses', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(201, { transport: 'web', sessionId: 'bad', csrfToken: 'x' }))
      .mockResolvedValueOnce(response(201, { transport: 'web', sessionId: '123e4567-e89b-42d3-a456-426614174000', csrfToken: 'x', extra: true }))
      .mockResolvedValueOnce(new Response(' '.repeat(32769), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    for (let i = 0; i < 3; i++) await expect(completeRegistration(`wev.${token}`, token, signal())).rejects.toMatchObject({ code: 'unavailable' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
