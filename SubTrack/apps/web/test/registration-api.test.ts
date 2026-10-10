import { afterEach, describe, expect, it, vi } from 'vitest';
import { startRegistration, verifyRegistration } from '../lib/registration-api';

const identifier = { channel: 'email' as const, identifier: 'fixture@example.test' };
const nonce = { nonce: 'nonce-a' };
const started = { challengeId: 'challenge-a', status: 'accepted', nextBrowserNonce: 'nonce-b' };
const verified = { purpose: 'enroll_identifier', proof: 'proof-a', nextBrowserNonce: 'nonce-c' };
const signal = () => new AbortController().signal;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8' },
});

afterEach(() => vi.restoreAllMocks());

describe('registration API boundary', () => {
  it('uses contract request fields, rotated nonce and distinct mutation keys', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(200, nonce)).mockResolvedValueOnce(json(202, started))
      .mockResolvedValueOnce(json(200, verified));
    await expect(startRegistration(identifier, signal())).resolves.toEqual({ challengeId: 'challenge-a', nextBrowserNonce: 'nonce-b' });
    await expect(verifyRegistration('challenge-a', '123456', 'nonce-b', signal())).resolves.toEqual(verified);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/v2/auth/browser-nonce', '/api/v2/auth/otp/start', '/api/v2/auth/otp/verify',
    ]);
    const options = fetchMock.mock.calls.map(([, init]) => init!);
    expect(options.map((init) => JSON.parse(init.body as string))).toEqual([
      { purpose: 'enroll_identifier' },
      { ...identifier, purpose: 'enroll_identifier', transport: 'web' },
      { challengeId: 'challenge-a', code: '123456', transport: 'web' },
    ]);
    const keys = options.map((init) => new Headers(init.headers).get('Idempotency-Key'));
    expect(new Set(keys).size).toBe(3);
    for (const init of options) {
      expect(init.credentials).toBe('include');
      expect(new Headers(init.headers).has('Origin')).toBe(false);
    }
    expect(new Headers(options[1]!.headers).get('X-Browser-Nonce')).toBe('nonce-a');
    expect(new Headers(options[2]!.headers).get('X-Browser-Nonce')).toBe('nonce-b');
  });

  it.each([null, [], {}, { nonce: '' }, { nonce: 1 }, { ...nonce, extra: true }, { nonce: 'x'.repeat(4097) }])(
    'rejects malformed bootstrap %j without starting OTP', async (body) => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(200, body));
      await expect(startRegistration(identifier, signal())).rejects.toMatchObject({ code: 'unavailable' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    { ...started, nextBrowserNonce: null }, { ...started, status: 'delivered' },
    { ...started, challengeId: '' }, { challengeId: 'challenge-a', status: 'accepted' },
    { ...started, extra: true },
  ])('rejects malformed OTP start %j', async (body) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(200, nonce)).mockResolvedValueOnce(json(202, body));
    await expect(startRegistration(identifier, signal())).rejects.toMatchObject({ code: 'unavailable' });
  });

  it.each([
    { ...verified, nextBrowserNonce: null }, { ...verified, purpose: 'otp_step_up' },
    { ...verified, proof: '' }, { ...verified, proof: 42 }, { ...verified, extra: true },
  ])('rejects malformed verification %j', async (body) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(200, body));
    await expect(verifyRegistration('challenge-a', '123456', 'nonce-b', signal())).rejects.toMatchObject({ code: 'unavailable' });
  });

  it.each([201, 202, 204, 401, 500])('rejects unexpected verification HTTP %i', async (status) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(status === 204 ? new Response(null, { status }) : json(status, verified));
    await expect(verifyRegistration('challenge-a', '123456', 'nonce-b', signal())).rejects.toMatchObject({ code: 'unavailable' });
  });

  it.each([
    new Response('<html>proxy error</html>', { headers: { 'Content-Type': 'text/html' } }),
    new Response('{broken', { headers: { 'Content-Type': 'application/json' } }),
    new Response(JSON.stringify(verified)),
  ])('rejects non-JSON and malformed bodies', async (response) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);
    await expect(verifyRegistration('challenge-a', '123456', 'nonce-b', signal())).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('requires a complete matching RFC problem to classify restart', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const problem = { type: 'about:blank', title: 'Conflict', status: 409, code: 'AUTH_RESTART_REQUIRED' };
    for (const [body, code] of [
      [problem, 'restart-required'], [{ ...problem, status: 401 }, 'unavailable'],
      [{ code: problem.code }, 'unavailable'], [{ ...problem, detail: null }, 'unavailable'],
    ] as const) {
      fetchMock.mockResolvedValueOnce(json(409, body));
      await expect(verifyRegistration('challenge-a', '123456', 'nonce-b', signal())).rejects.toMatchObject({ code });
    }
  });

  it('cancels an oversized streamed body regardless of Content-Length', async () => {
    const cancelled = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(32768)); controller.enqueue(new Uint8Array(1)); },
      cancel: cancelled,
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(body, {
      headers: { 'Content-Type': 'application/json', 'Content-Length': '1' },
    }));
    await expect(verifyRegistration('challenge-a', '123456', 'nonce-b', signal())).rejects.toMatchObject({ code: 'unavailable' });
    expect(cancelled).toHaveBeenCalledTimes(1);
  });

  it('accepts exactly 32 KiB of valid JSON and counts encoded bytes', async () => {
    const padded = JSON.stringify(verified).padEnd(32768, ' ');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(padded, {
      headers: { 'Content-Type': 'application/json' },
    }));
    await expect(verifyRegistration('challenge-a', '123456', 'nonce-b', signal())).resolves.toEqual(verified);
    fetchMock.mockResolvedValueOnce(json(200, { ...verified, proof: '界'.repeat(12000) }));
    await expect(verifyRegistration('challenge-a', '123456', 'nonce-b', signal())).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('aborts pending body consumption without issuing another request', async () => {
    const cancelled = vi.fn();
    const reading = vi.fn();
    const body = new ReadableStream<Uint8Array>({ pull: reading, cancel: cancelled });
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(body, { headers: { 'Content-Type': 'application/json' } }));
    const result = expect(startRegistration(identifier, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(reading).toHaveBeenCalled());
    controller.abort();
    await result;
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not dispatch when already aborted and sanitizes network failure', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('private server detail'));
    const controller = new AbortController(); controller.abort();
    await expect(startRegistration(identifier, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(startRegistration(identifier, signal())).rejects.toMatchObject({ message: 'unavailable' });
  });
});
