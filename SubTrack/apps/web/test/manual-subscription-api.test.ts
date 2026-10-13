import { afterEach, describe, expect, it, vi } from 'vitest';
import { newManualIntent, saveManualSubscription } from '../lib/manual-subscription-api';

const body = { customName: ' Synthetic ', categoryCode: 'VIDEO_STREAMING', cadence: 'MONTHLY' as const,
  expectedAmountMinor: '9007199254740993', nextChargeDate: null };
const id = '123e4567-e89b-42d3-a456-426614174000';
const signal = new AbortController().signal;
const result = (status: number, value: unknown, media = 'application/json') => new Response(JSON.stringify(value),
  { status, headers: { 'Content-Type': media } });
afterEach(() => vi.restoreAllMocks());
describe('manual subscription wire', () => {
  it('freezes canonical intent and sends exactly the same key/body on explicit checking', async () => {
    const intent = newManualIntent(body);
    expect(Object.isFrozen(intent)).toBe(true); expect(Object.isFrozen(intent.body)).toBe(true);
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('private network information'))
      .mockResolvedValueOnce(result(201, { id }));
    await expect(saveManualSubscription(intent, 'csrf', signal)).rejects.toMatchObject({ code: 'uncertain', message: 'uncertain' });
    expect(await saveManualSubscription(intent, 'csrf', signal)).toBe(id);
    expect(fetch.mock.calls[0]).toEqual(fetch.mock.calls[1]);
    const options = fetch.mock.calls[0]![1]!;
    expect(options).toMatchObject({ method: 'POST', cache: 'no-store', credentials: 'include' });
    expect(options.headers).toEqual({ 'Content-Type': 'application/json', 'X-Session-CSRF': 'csrf', 'Idempotency-Key': intent.key });
    expect(JSON.parse(options.body as string)).toEqual({ ...body, customName: 'Synthetic' });
  });
  it.each([[400, 'INVALID_MANUAL_REQUEST', 'invalid'], [401, 'AUTHENTICATION_REQUIRED', 'login-required'],
    [403, 'MANUAL_REQUEST_REJECTED', 'login-required'], [409, 'MODE_CONFLICT', 'mode-conflict'],
    [409, 'MANUAL_IDEMPOTENCY_CONFLICT', 'receipt-conflict'], [500, 'INTERNAL_ERROR', 'uncertain']] as const)('maps closed %s %s', async (status, code, expected) => {
      const title = ({ 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 409: 'Conflict', 500: 'Internal Server Error' })[status];
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(result(status, { type: 'about:blank', title, status, code }, 'application/problem+json'));
      await expect(saveManualSubscription(newManualIntent(body), 'csrf', signal)).rejects.toMatchObject({ code: expected });
    });
  it('rejects malformed success and problem bodies without guessing a result', async () => {
    for (const response of [result(200, { id }), result(201, { id, secret: 'x' }), result(201, { id: 'wrong' }),
      result(201, { id }, 'text/plain'), result(409, { code: 'MODE_CONFLICT' }, 'application/problem+json'),
      result(400, { type: 'about:blank', title: 'Bad Request', status: 400, code: 'WRONG' }, 'application/problem+json'),
      result(201, { id, padding: 'x'.repeat(5000) })]) {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);
      await expect(saveManualSubscription(newManualIntent(body), 'csrf', signal)).rejects.toMatchObject({ code: 'uncertain' });
      vi.restoreAllMocks();
    }
  });
  it('does not send invalid authority, key or body', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch'); const intent = newManualIntent(body);
    await expect(saveManualSubscription(intent, '', signal)).rejects.toMatchObject({ code: 'login-required' });
    await expect(saveManualSubscription({ ...intent, key: id.toUpperCase() }, 'csrf', signal)).rejects.toMatchObject({ code: 'invalid' });
    await expect(saveManualSubscription({ ...intent, body: { ...body, expectedAmountMinor: '0' } }, 'csrf', signal)).rejects.toMatchObject({ code: 'invalid' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
