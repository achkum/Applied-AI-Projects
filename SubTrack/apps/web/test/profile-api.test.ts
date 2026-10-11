import { afterEach, describe, expect, it, vi } from 'vitest';
import { readProfile, patchProfile } from '../lib/profile-api';

const view = { displayName: 'Synthetic Owner', avatarColourToken: null, avatarEmoji: null,
  language: 'en', theme: 'system', defaultCurrency: 'SEK', profileComplete: true };
const response = (status: number, body: unknown, media = 'application/json') => new Response(JSON.stringify(body), { status,
  headers: { 'Content-Type': media } });
const signal = () => new AbortController().signal;
afterEach(() => vi.restoreAllMocks());

describe('private owner profile API', () => {
  it('reads {}, patches only mutable fields and separately rereads with current CSRF', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(response(200, view)));
    await readProfile('current-csrf', signal());
    await patchProfile({ displayName: 'Synthetic Owner' }, 'current-csrf', signal());
    await readProfile('current-csrf', signal());
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/v2/me/profile/read', '/v2/me/profile', '/v2/me/profile/read']);
    expect(fetchMock.mock.calls.map(([, init]) => [init?.method, JSON.parse(init?.body as string)])).toEqual([
      ['POST', {}], ['PATCH', { displayName: 'Synthetic Owner' }], ['POST', {}],
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.credentials).toBe('include'); expect(init?.cache).toBe('no-store');
      expect(new Headers(init?.headers).get('X-Session-CSRF')).toBe('current-csrf');
      expect(new Headers(init?.headers).has('Origin')).toBe(false);
      expect(new Headers(init?.headers).has('Idempotency-Key')).toBe(false);
    }
  });

  it('rejects extra view fields and forbidden patch authority before dispatch', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(200, { ...view, ownerId: 'foreign' }));
    await expect(readProfile('csrf', signal())).rejects.toMatchObject({ code: 'unavailable' });
    expect(() => patchProfile({ displayName: 'Synthetic Owner', defaultCurrency: 'USD' } as never, 'csrf', signal()))
      .toThrowError('unavailable');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [401, 'AUTHENTICATION_REQUIRED', 'login-required'],
    [403, 'PROFILE_REQUEST_REJECTED', 'login-required'],
    [409, 'PROFILE_CONFLICT', 'conflict'],
  ] as const)('classifies closed %i problem', async (status, code, expected) => {
    const title = status === 401 ? 'Unauthorized' : status === 403 ? 'Forbidden' : 'Conflict';
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(status,
      { type: 'about:blank', title, status, code }, 'application/problem+json'));
    await expect(readProfile('csrf', signal())).rejects.toMatchObject({ code: expected });
  });

  it('fails closed for problem extensions and absent CSRF', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(401,
      { type: 'about:blank', title: 'Unauthorized', status: 401, code: 'AUTHENTICATION_REQUIRED', detail: 'private' }, 'application/problem+json'));
    await expect(readProfile('csrf', signal())).rejects.toMatchObject({ code: 'unavailable' });
    await expect(readProfile('', signal())).rejects.toMatchObject({ code: 'login-required' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
