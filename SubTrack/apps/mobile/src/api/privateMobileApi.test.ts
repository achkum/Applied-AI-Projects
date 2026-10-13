import { completeNativeEnrollment, verifiedNativeLogin, readNativeProfile, saveNativeProfile, readNativeMode, chooseNativeJustMe, readNativeSubscriptions, createNativeSubscription, rotateNativeSession, revokeNativeSession, PrivateMobileRequestError } from './privateMobileApi';
import { getPrivateRuntime } from '@/config/privateRuntime';
jest.mock('@/config/privateRuntime', () => ({ getPrivateRuntime: jest.fn(() => ({ apiBaseUrl: 'https://private.example.test' })) }));
jest.mock('expo-crypto', () => ({ getRandomBytesAsync: jest.fn(async (length: number) => new Uint8Array(length).fill(7)) }));
const credentials = { transport: 'mobile' as const, sessionId: '123e4567-e89b-42d3-a456-426614174000', accessToken: 'header.payload.signature', refreshToken: 'v2r.' + 'a'.repeat(43) };
const signal = new AbortController().signal;
function response(status: number, body: unknown) { return { status, headers: { get: (name: string) => name === 'cache-control' ? 'no-store' : 'application/json' }, text: async () => JSON.stringify(body) } as Response; }
afterEach(() => jest.restoreAllMocks());
it('completes only the restricted enrollment envelope and does not send browser authority or an identity selector', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(201, credentials));
  const proof = 'v2.' + 'b'.repeat(43); expect(await completeNativeEnrollment(proof, 'sv', signal)).toEqual(credentials);
  const [url, options] = fetch.mock.calls[0]!;
  expect(url).toBe('https://private.example.test/v2/private/mobile/enrollment/complete');
  expect(JSON.parse(options!.body as string)).toEqual({ transport: 'mobile', enrollmentProof: proof, locale: 'sv' });
  expect(Object.keys(options!.headers!)).toEqual(['Content-Type', 'Idempotency-Key']);
  expect(options).toMatchObject({ credentials: 'omit', redirect: 'error', cache: 'no-store' });
});
it('uses fresh server-verifier evidence before exchanging a mobile login proof', async () => {
  const proof = 'v2.' + 'c'.repeat(43);
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(200, { transport: 'mobile', loginProof: proof, status: 'verified' }))
    .mockResolvedValueOnce(response(201, credentials));
  await verifiedNativeLogin(signal);
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(['https://private.example.test/v2/private/mobile/login/verify', 'https://private.example.test/v2/private/mobile/session']);
  expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string)).toEqual({ transport: 'mobile' });
  expect(fetch.mock.calls.every(([, options]) => /^[0-9a-f]{64}$/.test((options!.headers as Record<string, string>)['Idempotency-Key']!))).toBe(true);
  expect(JSON.parse(fetch.mock.calls[1]![1]!.body as string)).toEqual({ transport: 'mobile', loginProof: proof });
});
it('separates Bearer business/logout from Refresh-only rotation and keeps exact bigint text on Add', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(200, { displayName: null, avatarColourToken: null, avatarEmoji: null, language: 'sv', theme: 'system', defaultCurrency: 'SEK', profileComplete: false }))
    .mockResolvedValueOnce(response(201, { id: credentials.sessionId })).mockResolvedValueOnce(response(200, credentials)).mockResolvedValueOnce(response(204, null));
  await readNativeProfile(credentials.accessToken, signal);
  await createNativeSubscription({ customName: 'Synthetic', categoryCode: 'VIDEO_STREAMING', cadence: 'MONTHLY', expectedAmountMinor: '9007199254740993', nextChargeDate: null }, credentials.accessToken, signal);
  await rotateNativeSession(credentials, signal); await revokeNativeSession(credentials, signal);
  const headers = fetch.mock.calls.map(([, options]) => options!.headers as Record<string, string>);
  expect(headers.map(value => value.Authorization)).toEqual(['Bearer ' + credentials.accessToken, 'Bearer ' + credentials.accessToken, 'Refresh ' + credentials.refreshToken, 'Bearer ' + credentials.accessToken]);
  expect(headers[1]!['Idempotency-Key']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(headers[0]).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + credentials.accessToken });
  expect(headers[2]).toEqual({ 'Idempotency-Key': expect.stringMatching(/^[0-9a-f]{64}$/), Authorization: 'Refresh ' + credentials.refreshToken });
  expect(Object.prototype.hasOwnProperty.call(fetch.mock.calls[2]![1], 'body')).toBe(false);
  expect(headers[3]).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + credentials.accessToken });
  expect(JSON.parse(fetch.mock.calls[1]![1]!.body as string).expectedAmountMinor).toBe('9007199254740993');
});
it('forbids idempotency keys on every protected profile, mode, owner-read and logout operation', async () => {
  const profile = { displayName: 'Synthetic', avatarColourToken: null, avatarEmoji: null, language: 'en', theme: 'system', defaultCurrency: 'SEK', profileComplete: true };
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(200, profile)).mockResolvedValueOnce(response(200, profile))
    .mockResolvedValueOnce(response(200, { mode: 'just-me' })).mockResolvedValueOnce(response(200, { mode: 'just-me' }))
    .mockResolvedValueOnce(response(200, { items: [], nextCursor: null })).mockResolvedValueOnce(response(204, null));
  await readNativeProfile(credentials.accessToken, signal); await saveNativeProfile({ displayName: 'Synthetic' }, credentials.accessToken, signal);
  await readNativeMode(credentials.accessToken, signal); await chooseNativeJustMe(credentials.accessToken, signal);
  await readNativeSubscriptions(credentials.accessToken, signal); await revokeNativeSession(credentials, signal);
  for (const [, options] of fetch.mock.calls) expect(options!.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + credentials.accessToken });
  expect(fetch.mock.calls.map(([, options]) => JSON.parse(options!.body as string))).toEqual([{}, { displayName: 'Synthetic' }, {}, { mode: 'just-me' }, {}, {}]);
});
it('does not retry lost or malformed success responses and fails closed when runtime is unavailable', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('private network details'))
    .mockResolvedValueOnce(response(201, { ...credentials, identity: 'foreign' }));
  await expect(verifiedNativeLogin(signal)).rejects.toEqual(new PrivateMobileRequestError()); expect(fetch).toHaveBeenCalledTimes(1);
  await expect(completeNativeEnrollment('v2.' + 'b'.repeat(43), 'en', signal)).rejects.toEqual(new PrivateMobileRequestError());
  jest.mocked(getPrivateRuntime).mockReturnValueOnce(null);
  await expect(verifiedNativeLogin(signal)).rejects.toEqual(new PrivateMobileRequestError()); expect(fetch).toHaveBeenCalledTimes(2);
});
