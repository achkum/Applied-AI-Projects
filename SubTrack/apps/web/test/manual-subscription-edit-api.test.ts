import { afterEach, describe, expect, it, vi } from 'vitest';
import { newManualEditIntent, editManualSubscription } from '../lib/manual-subscription-edit-api';

const body = { customName: ' Synthetic ', categoryCode: 'VIDEO_STREAMING', cadence: 'MONTHLY' as const,
  expectedAmountMinor: '9007199254740993', nextChargeDate: null, expectedRevision: '1' };
const id = '123e4567-e89b-42d3-a456-426614174000';
const signal = new AbortController().signal;
const result = (status: number, value: unknown, media = 'application/json') => new Response(JSON.stringify(value),
  { status, headers: { 'Content-Type': media } });
afterEach(() => vi.restoreAllMocks());
describe('manual subscription wire', () => {
  it('freezes canonical intent and sends exactly the same key/body on explicit checking', async () => {
    const intent = newManualEditIntent(id, body);
    expect(Object.isFrozen(intent)).toBe(true); expect(Object.isFrozen(intent.body)).toBe(true);
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('private network information'))
      .mockResolvedValueOnce(result(200, { id, revision: '2' }));
    await expect(editManualSubscription(intent, 'csrf', signal)).rejects.toMatchObject({ code: 'uncertain', message: 'uncertain' });
    expect(await editManualSubscription(intent, 'csrf', signal)).toEqual({ id, revision: '2' });
    expect(fetch.mock.calls[0]).toEqual(fetch.mock.calls[1]);
    const options = fetch.mock.calls[0]![1]!;
    expect(options).toMatchObject({ method: 'POST', cache: 'no-store', credentials: 'include' });
    expect(options.headers).toEqual({ 'Content-Type': 'application/json', 'X-Session-CSRF': 'csrf', 'Idempotency-Key': intent.key });
    expect(JSON.parse(options.body as string)).toEqual({ ...body, customName: 'Synthetic' });
  });
  it.each([[400, 'INVALID_MANUAL_EDIT_REQUEST', 'invalid'], [401, 'AUTHENTICATION_REQUIRED', 'login-required'],
    [403, 'MANUAL_EDIT_REQUEST_REJECTED', 'login-required'], [409, 'MODE_CONFLICT', 'mode-conflict'], [404, 'SUBSCRIPTION_NOT_FOUND', 'missing'], [409, 'MANUAL_EDIT_CONFLICT', 'stale'],
    [409, 'MANUAL_EDIT_IDEMPOTENCY_CONFLICT', 'receipt-conflict'], [500, 'INTERNAL_ERROR', 'uncertain']] as const)('maps closed %s %s', async (status, code, expected) => {
      const title = ({ 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 409: 'Conflict', 500: 'Internal Server Error' })[status];
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(result(status, { type: 'about:blank', title, status, code }, 'application/problem+json'));
      await expect(editManualSubscription(newManualEditIntent(id, body), 'csrf', signal)).rejects.toMatchObject({ code: expected });
    });
  it('rejects malformed success and problem bodies without guessing a result', async () => {
    for (const response of [result(201, { id, revision: '2' }), result(200, { id, secret: 'x' }), result(200, { id: 'wrong' }),
      result(200, { id: '123e4567-e89b-42d3-a456-426614174001', revision: '2' }),
      ...['0', '01', '9223372036854775808'].map(revision => result(200, { id, revision })),
      result(200, { id, revision: '2' }, 'text/plain'), result(409, { code: 'MODE_CONFLICT' }, 'application/problem+json'),
      result(400, { type: 'about:blank', title: 'Bad Request', status: 400, code: 'WRONG' }, 'application/problem+json'),
      result(200, { id, padding: 'x'.repeat(5000) })]) {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);
      await expect(editManualSubscription(newManualEditIntent(id, body), 'csrf', signal)).rejects.toMatchObject({ code: 'uncertain' });
      vi.restoreAllMocks();
    }
  });
  it('does not send invalid authority, key or body', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch'); const intent = newManualEditIntent(id, body);
    await expect(editManualSubscription(intent, '', signal)).rejects.toMatchObject({ code: 'login-required' });
    await expect(editManualSubscription({ ...intent, key: id.toUpperCase() }, 'csrf', signal)).rejects.toMatchObject({ code: 'invalid' });
    await expect(editManualSubscription({ ...intent, id: '../foreign' }, 'csrf', signal)).rejects.toMatchObject({ code: 'invalid' });
    await expect(editManualSubscription({ ...intent, body: { ...body, expectedRevision: '0' } }, 'csrf', signal)).rejects.toMatchObject({ code: 'invalid' });
    await expect(editManualSubscription({ ...intent, body: { ...body, expectedAmountMinor: '0' } }, 'csrf', signal)).rejects.toMatchObject({ code: 'invalid' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
