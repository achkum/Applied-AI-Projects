import { afterEach, describe, expect, it, vi } from 'vitest';
import { chooseJustMe, readMode, readOwnerSubscriptions, readOwnerSubscription, patchOwnerSubscription } from '../lib/private-onboarding-api';

const id = '123e4567-e89b-42d3-a456-426614174000';
const row = { visibility: 'owner', id, customName: 'Synthetic', merchantId: null, merchantName: null,
  categoryCode: 'VIDEO_STREAMING', cadence: 'MONTHLY', status: 'ACTIVE', expectedAmountMinor: '9007199254740993',
  currency: 'SEK', nextChargeDate: null, alwaysPrivate: true };
const signal = new AbortController().signal;
const success = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const problem = (status: number, code: string) => new Response(JSON.stringify({ type: 'about:blank',
  title: ({ 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 409: 'Conflict', 500: 'Internal Server Error' } as Record<number, string>)[status],
  status, code }), { status, headers: { 'Content-Type': 'application/problem+json' } });
afterEach(() => vi.restoreAllMocks());

describe('private current-session API', () => {
  it('posts exact mode choice and a separate read with the same volatile CSRF', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(success({ mode: 'just-me' })).mockResolvedValueOnce(success({ mode: 'just-me' }));
    expect(await chooseJustMe('csrf', signal)).toBe('just-me');
    expect(await readMode('csrf', signal)).toBe('just-me');
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/v2/me/mode', '/v2/me/mode/read']);
    expect(fetchMock.mock.calls.map(([, options]) => JSON.parse(options?.body as string))).toEqual([{ mode: 'just-me' }, {}]);
    expect(fetchMock.mock.calls.every(([, options]) => options?.credentials === 'include' && options.cache === 'no-store' &&
      (options.headers as Record<string, string>)['X-Session-CSRF'] === 'csrf')).toBe(true);
  });

  it('rejects peer rows, extra fields, duplicate IDs, invalid dates and malformed problems', async () => {
    const cases = [
      { items: [{ ...row, visibility: 'household' }], nextCursor: null },
      { items: [{ ...row, secret: 'x' }], nextCursor: null },
      { items: [row, row], nextCursor: null },
      { items: [{ ...row, nextChargeDate: '2026-02-31' }], nextCursor: null },
    ];
    for (const body of cases) {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(success(body));
      await expect(readOwnerSubscriptions('csrf', signal)).rejects.toMatchObject({ code: 'unavailable' });
      vi.restoreAllMocks();
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(problem(409, 'WRONG_CODE'));
    await expect(readMode('csrf', signal)).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('accepts a full 50-row page and sends only opaque continuation cursor', async () => {
    const rows = Array.from({ length: 50 }, (_, index) => ({ ...row, id: `123e4567-e89b-42d3-a456-${String(index).padStart(12, '0')}`,
      customName: 'Ä'.repeat(120), merchantName: 'Ö'.repeat(120) }));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(success({ items: rows, nextCursor: 'abc_123' }))
      .mockResolvedValueOnce(success({ items: [], nextCursor: null }));
    expect((await readOwnerSubscriptions('csrf', signal)).items).toHaveLength(50);
    await readOwnerSubscriptions('csrf', signal, 'abc_123');
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toEqual({ cursor: 'abc_123' });
  });

  it('uses displayed UUID for strict detail and one status request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(success(row)).mockResolvedValueOnce(success({ id, status: 'PAUSED' }));
    expect((await readOwnerSubscription(id, 'csrf', signal)).id).toBe(id);
    await patchOwnerSubscription(id, 'PAUSED', 'csrf', signal);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([`/v2/subscriptions/${id}/read`, `/v2/subscriptions/${id}`]);
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toEqual({ status: 'PAUSED' });
  });
});
