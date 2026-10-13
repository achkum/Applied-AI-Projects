import { afterEach, describe, expect, it, vi } from 'vitest';
import { completeLogin, LoginApiError, startLogin, verifyLogin } from '../lib/login-api';

const token = 'A'.repeat(43);
const json = (status: number, body: unknown, contentType = 'application/json') =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': contentType } }));
afterEach(() => vi.restoreAllMocks());

describe('private returning login wire', () => {
  it('uses a fresh session nonce, finite fixture selection, one-use proof and exact web session', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => json(200, { nonce: token }))
      .mockImplementationOnce(() => json(200, { transport: 'web', loginProof: `v2.${token}`, status: 'verified', nextBrowserNonce: token }))
      .mockImplementationOnce(() => json(201, { transport: 'web', sessionId: '123e4567-e89b-42d3-a456-426614174000', csrfToken: 'csrf' }));
    const signal = new AbortController().signal;
    const nonce = await startLogin(signal);
    const verified = await verifyLogin('bob', nonce, signal);
    expect(await completeLogin(verified.loginProof, verified.nextBrowserNonce, signal)).toEqual({ csrfToken: 'csrf' });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/v2/auth/browser-nonce', '/v2/auth/login/simulator/verify', '/v2/auth/session',
    ]);
    expect(fetchMock.mock.calls.map(([, options]) => JSON.parse(options?.body as string))).toEqual([
      { purpose: 'session' }, { transport: 'web', demoIdentity: 'bob' }, { transport: 'web', loginProof: `v2.${token}` },
    ]);
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({ 'X-Browser-Nonce': token });
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toMatchObject({ 'X-Browser-Nonce': token });
    for (const [, options] of fetchMock.mock.calls) {
      expect(options?.credentials).toBe('include');
      expect(options?.cache).toBe('no-store');
      expect((options?.headers as Record<string, string>)['Idempotency-Key']).toBeTruthy();
    }
  });

  it('rejects extra identity fields and malformed proof without session redemption', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => json(200, {
      transport: 'web', loginProof: `v2.${token}`, status: 'verified', nextBrowserNonce: token, ownerId: 'forbidden',
    }));
    await expect(verifyLogin('alice', token, new AbortController().signal)).rejects.toEqual(new LoginApiError('unavailable'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(completeLogin('invalid', token, new AbortController().signal)).rejects.toEqual(new LoginApiError('unavailable'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('turns a committed one-use conflict into a fresh-chain restart', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => json(409,
      { type: 'about:blank', title: 'Authentication unavailable', status: 409, code: 'AUTH_RESTART_REQUIRED' }, 'application/problem+json'));
    await expect(verifyLogin('alice', token, new AbortController().signal)).rejects.toEqual(new LoginApiError('restart-required'));
  });

  it('rejects a changed conflict title and cancels an unexpected media stream', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => json(409,
      { type: 'about:blank', title: 'Conflict', status: 409, code: 'AUTH_RESTART_REQUIRED' }, 'application/problem+json'));
    await expect(verifyLogin('alice', token, new AbortController().signal)).rejects.toEqual(new LoginApiError('unavailable'));

    const cancelled = vi.fn();
    const body = new ReadableStream({ cancel: cancelled });
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => Promise.resolve(new Response(body, {
      status: 200, headers: { 'Content-Type': 'text/plain' },
    })));
    await expect(startLogin(new AbortController().signal)).rejects.toEqual(new LoginApiError('unavailable'));
    expect(cancelled).toHaveBeenCalledOnce();
  });
});
