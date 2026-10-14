import { createSandboxMobileApi, sandboxMobileApi } from './sandboxMobileApi';
jest.mock('expo-crypto', () => ({ getRandomBytesAsync: jest.fn(async () => new Uint8Array(16).fill(7)) }));
const id = '123e4567-e89b-42d3-a456-426614174000';
const encode = (v: object) => btoa(JSON.stringify(v)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const header = { alg: 'EdDSA', typ: 'subtrack-sandbox-access+jwt', kid: 'st250-sandbox-v1' };
const claims = { iss: 'urn:subtrack:auth:v2:sandbox', aud: 'urn:subtrack:api:v2:sandbox', sub: id, sid: id, iat: 100, exp: 1000, ver: 2 };
const token = `${encode(header)}.${encode(claims)}.signature`;
const credentials = { transport: 'sandbox-mobile', sessionId: id, accessToken: token, refreshToken: `s250r.${'A'.repeat(43)}`, sessionExpiresAt: 1000001 };
const capability = `s250c.${'A'.repeat(43)}`;
const signal = () => new AbortController().signal;
function response(status: number, body: unknown, media = 'application/json', cache = 'no-store'): Response {
  return { status, headers: { get: (name: string) => name === 'cache-control' ? cache : media }, text: async () => JSON.stringify(body) } as Response;
}
function fixture() {
  const fetch = jest.fn().mockResolvedValue(response(201, { ...credentials, installationCapability: capability })) as jest.MockedFunction<typeof globalThis.fetch>;
  const entropy = jest.fn(async () => new Uint8Array(16).fill(7));
  return { fetch, entropy, api: createSandboxMobileApi({ runtime: () => ({ apiBaseUrl: 'https://198.44.116.159' }), fetch, entropy }) };
}
it('bootstrap creates only the closed sandbox request and namespace with a UUIDv4 key', async () => {
  const f = fixture(); const result = await f.api.bootstrap('sv', signal()); expect(result.installationCapability).toBe(capability);
  const [url, options] = f.fetch.mock.calls[0]!; expect(url).toBe('https://198.44.116.159/v2/sandbox/mobile/bootstrap');
  expect(JSON.parse(options!.body as string)).toEqual({ transport: 'sandbox-mobile', locale: 'sv' });
  expect(options).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store' });
  expect(Object.keys(options!.headers!)).toEqual(['Content-Type', 'Idempotency-Key']);
  expect((options!.headers as Record<string, string>)['Idempotency-Key']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
it('resume never sends an owner and refresh is bodyless with its separate credential', async () => {
  const f = fixture(); f.fetch.mockResolvedValue(response(201, credentials)); await f.api.resume(capability, signal());
  expect(f.fetch.mock.calls[0]![1]!.headers).toMatchObject({ Authorization: `SandboxCapability ${capability}` });
  f.fetch.mockResolvedValue(response(200, credentials)); await f.api.refresh(credentials as never, signal());
  expect(f.fetch.mock.calls[1]![1]!.body).toBeUndefined(); expect(f.fetch.mock.calls[1]![1]!.headers).not.toHaveProperty('Content-Type');
  f.fetch.mockResolvedValue(response(204, null)); await f.api.logout(credentials as never, signal());
  expect(f.fetch.mock.calls[2]![1]!.headers).toEqual({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });
});
it('read/profile/mode and manual create/edit/status use the bounded business route', async () => {
  const f = fixture(), profile = { displayName: 'Fiction', avatarColourToken: null, avatarEmoji: null, language: 'en', theme: 'system', defaultCurrency: 'SEK', profileComplete: true };
  f.fetch.mockResolvedValue(response(200, profile)); await f.api.readNativeProfile(token, signal()); await f.api.saveNativeProfile({ displayName: 'Fiction' }, token, signal());
  f.fetch.mockResolvedValue(response(200, { mode: 'just-me' })); await f.api.readNativeMode(token, signal()); await f.api.chooseNativeJustMe(token, signal());
  f.fetch.mockResolvedValue(response(200, { items: [], nextCursor: null })); await f.api.readNativeSubscriptions(token, signal());
  const body = { customName: 'Fiction', categoryCode: 'VIDEO_STREAMING', cadence: 'MONTHLY', expectedAmountMinor: '100', nextChargeDate: null };
  f.fetch.mockResolvedValue(response(201, { id })); await f.api.createNativeSubscription(body, token, signal());
  const conflict = { type: 'about:blank', title: 'Sandbox request unavailable', status: 409, code: 'MANUAL_EDIT_CONFLICT' };
  f.fetch.mockResolvedValue(response(409, conflict, 'application/problem+json')); expect(await f.api.editNativeSubscription({ ...body, id, expectedRevision: '1' }, token, signal())).toEqual({ conflict: conflict.code });
  f.fetch.mockResolvedValue(response(409, { ...conflict, code: 'LIFECYCLE_CONFLICT' }, 'application/problem+json')); await f.api.updateNativeSubscriptionStatus({ id, status: 'PAUSED' }, token, signal());
  expect(f.fetch.mock.calls.every(([url]) => url.toString().endsWith('/business'))).toBe(true);
});
it.each([
  ['cache', response(201, { ...credentials, installationCapability: capability }, 'application/json', 'public')],
  ['status', response(409, {})], ['media', response(201, {}, 'text/plain')], ['shape', response(201, { ...credentials, installationCapability: capability, owner: id })],
  ['private', response(201, { ...credentials, transport: 'mobile', installationCapability: capability })],
  ['namespace', response(201, { ...credentials, accessToken: `${encode(header)}.${encode({ ...claims, iss: 'production' })}.signature`, installationCapability: capability })],
  ['oversize', response(201, 'x'.repeat(131073))],
] as const)('withholds malformed %s responses without retry', async (_name, result) => {
  const f = fixture(); f.fetch.mockResolvedValue(result); await expect(f.api.bootstrap('en', signal())).rejects.toThrow('Sandbox request unavailable'); expect(f.fetch).toHaveBeenCalledTimes(1);
});
it('disabled production composition, invalid origin, abort and entropy failure never fetch', async () => {
  await expect(sandboxMobileApi.bootstrap('en', signal())).rejects.toThrow();
  const f = fixture(); f.entropy.mockResolvedValueOnce(new Uint8Array(15)); await expect(f.api.bootstrap('en', signal())).rejects.toThrow();
  const controller = new AbortController(); controller.abort(); await expect(f.api.bootstrap('en', controller.signal)).rejects.toThrow(); expect(f.fetch).not.toHaveBeenCalled();
});
it('resolved post-abort network results are rejected and unknown conflict codes never escape', async () => {
  const f = fixture(), controller = new AbortController(); f.fetch.mockImplementation(async () => { controller.abort(); return response(201, { ...credentials, installationCapability: capability }); });
  await expect(f.api.bootstrap('en', controller.signal)).rejects.toThrow();
  f.fetch.mockResolvedValue(response(409, { type: 'about:blank', title: 'Sandbox request unavailable', status: 409, code: 'UNKNOWN' }, 'application/problem+json'));
  await expect(f.api.updateNativeSubscriptionStatus({ id, status: 'PAUSED' }, token, signal())).rejects.toThrow();
});
it.each([
 {type:'about:blank',title:'Conflict',status:409,code:'MANUAL_EDIT_CONFLICT'},
 {type:'about:blank',title:'Sandbox request unavailable',status:500,code:'SANDBOX_UNAVAILABLE'},
 {type:'about:blank',title:'Sandbox request unavailable',status:409,code:'SANDBOX_RESTART_REQUIRED'},
 {type:'about:blank',title:'Sandbox request unavailable',status:409,code:'MANUAL_EDIT_CONFLICT',owner:id},
])('does not return a typed business conflict for malformed/mismatched server problems',async problem=>{
 const f=fixture();f.fetch.mockResolvedValue(response(409,problem,'application/problem+json'));await expect(f.api.updateNativeSubscriptionStatus({id,status:'PAUSED'},token,signal())).rejects.toThrow('Sandbox request unavailable');expect(f.fetch).toHaveBeenCalledTimes(1);
});
it.each(['unicode', 'bits', 'noncanonical', 'wrong-session', 'wrong-header'])('rejects incompatible sandbox token %s', async kind => {
  const f = fixture(); const h = kind === 'unicode' ? encode({ ...header, kid: 'é' }) : kind === 'bits' ? 'A' : kind === 'noncanonical' ? btoa(' {"alg":"EdDSA"}').replace(/=/g, '') : encode(kind === 'wrong-header' ? { ...header, alg: 'none' } : header);
  const p = encode(kind === 'wrong-session' ? { ...claims, sid: '223e4567-e89b-42d3-a456-426614174000' } : claims);
  f.fetch.mockResolvedValue(response(201, { ...credentials, accessToken: `${h}.${p}.signature`, installationCapability: capability })); await expect(f.api.bootstrap('en', signal())).rejects.toThrow();
});
it('aborted entropy or body delivery cannot fetch/accept and unsupported owner rows are rejected', async () => {
  const f = fixture(), a = new AbortController(); f.entropy.mockImplementation(async () => { a.abort(); return new Uint8Array(16); }); await expect(f.api.bootstrap('en', a.signal)).rejects.toThrow(); expect(f.fetch).not.toHaveBeenCalled();
  const g = fixture(), b = new AbortController(); g.fetch.mockResolvedValue({ ...response(201, {}), text: async () => { b.abort(); return JSON.stringify({ ...credentials, installationCapability: capability }); } }); await expect(g.api.bootstrap('en', b.signal)).rejects.toThrow();
  const row = { id, revision: '1', source: 'DETECTED', visibility: 'owner', customName: 'Fiction', merchantId: null, merchantName: null, categoryCode: 'VIDEO_STREAMING', cadence: 'MONTHLY', status: 'ACTIVE', expectedAmountMinor: '100', currency: 'SEK', nextChargeDate: null, alwaysPrivate: true };
  const h = fixture(); h.fetch.mockResolvedValue(response(200, { items: [row], nextCursor: null })); await expect(h.api.readNativeSubscriptions(token, signal(), 'invalid')).rejects.toThrow();
  await expect(h.api.readNativeSubscriptions(token, signal())).rejects.toThrow();
  for(const variant of [{source:'MANUAL',currency:'EUR',alwaysPrivate:true},{source:'MANUAL',currency:'SEK',alwaysPrivate:false}]){h.fetch.mockResolvedValue(response(200,{items:[{...row,...variant}],nextCursor:null}));await expect(h.api.readNativeSubscriptions(token,signal())).rejects.toThrow();}
  await expect(h.api.readNativeProfile('malformed',signal())).rejects.toThrow();
});
