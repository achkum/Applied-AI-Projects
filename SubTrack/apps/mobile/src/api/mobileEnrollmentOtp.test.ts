import { Platform } from 'react-native';
import { createMobileEnrollmentClient } from './mobileEnrollmentOtp';

const mockRandom = jest.fn();
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: (...args: unknown[]) => mockRandom(...args),
}));

const challengeId = 'a'.repeat(43);
const proof = `v2.${'b'.repeat(43)}`;
const originalOs = Platform.OS;
const originalFetch = globalThis.fetch;
let startMobileEnrollment: ReturnType<
  typeof createMobileEnrollmentClient
>['start'];
let verifyMobileEnrollment: ReturnType<
  typeof createMobileEnrollmentClient
>['verify'];

describe('development mobile enrollment wire calls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as typeof globalThis & { __DEV__: boolean }).__DEV__ = true;
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    ({ start: startMobileEnrollment, verify: verifyMobileEnrollment } =
      createMobileEnrollmentClient('true', 'https://api.example.test'));
    mockRandom.mockImplementation(async () =>
      Uint8Array.from({ length: 32 }, (_, i) => i),
    );
    globalThis.fetch = jest.fn(async () => ({
      status: 202,
      json: async () => ({
        challengeId,
        status: 'accepted',
        nextBrowserNonce: null,
      }),
    })) as unknown as typeof fetch;
  });
  afterAll(() => {
    Object.defineProperty(Platform, 'OS', {
      value: originalOs,
      configurable: true,
    });
    globalThis.fetch = originalFetch;
  });

  it('sends exact mobile envelopes with a fresh cryptorandom key for each explicit action', async () => {
    const startFetch = jest.mocked(globalThis.fetch);
    await startMobileEnrollment('email', 'person@example.test');
    mockRandom.mockImplementationOnce(async () =>
      Uint8Array.from({ length: 32 }, (_, i) => 255 - i),
    );
    await startMobileEnrollment('phone', '+46701234567');
    const starts = startFetch.mock.calls;
    globalThis.fetch = jest.fn(async () => ({
      status: 200,
      json: async () => ({
        purpose: 'enroll_identifier',
        proof,
        nextBrowserNonce: null,
      }),
    })) as unknown as typeof fetch;
    await verifyMobileEnrollment(challengeId, '123456');
    expect(mockRandom).toHaveBeenCalledTimes(3);
    expect(starts).toHaveLength(2);
    expect(starts[0]).toEqual([
      'https://api.example.test/v2/auth/otp/start',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': Array.from({ length: 32 }, (_, i) =>
            i.toString(16).padStart(2, '0'),
          ).join(''),
        },
        body: JSON.stringify({
          channel: 'email',
          identifier: 'person@example.test',
          purpose: 'enroll_identifier',
          transport: 'mobile',
        }),
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
      },
    ]);
    expect(starts[1]?.[1]).toMatchObject({
      headers: {
        'Idempotency-Key': Array.from({ length: 32 }, (_, i) =>
          (255 - i).toString(16).padStart(2, '0'),
        ).join(''),
      },
      body: JSON.stringify({
        channel: 'sms',
        identifier: '+46701234567',
        purpose: 'enroll_identifier',
        transport: 'mobile',
      }),
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.example.test/v2/auth/otp/verify',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': Array.from({ length: 32 }, (_, i) =>
            i.toString(16).padStart(2, '0'),
          ).join(''),
        },
        body: JSON.stringify({
          challengeId,
          code: '123456',
          transport: 'mobile',
        }),
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
      },
    );
  });

  it.each(['web', 'production', 'disabled', 'invalid-url'] as const)(
    'fails closed for %s before requesting random bytes',
    async (condition) => {
      if (condition === 'web')
        Object.defineProperty(Platform, 'OS', {
          value: 'web',
          configurable: true,
        });
      if (condition === 'production')
        (globalThis as typeof globalThis & { __DEV__: boolean }).__DEV__ =
          false;
      if (condition === 'disabled')
        ({ start: startMobileEnrollment } = createMobileEnrollmentClient(
          'false',
          'https://api.example.test',
        ));
      if (condition === 'invalid-url')
        ({ start: startMobileEnrollment } = createMobileEnrollmentClient(
          'true',
          'http://api.example.test',
        ));
      await expect(
        startMobileEnrollment('email', 'person@example.test'),
      ).rejects.toMatchObject({ reason: 'unavailable' });
      expect(mockRandom).not.toHaveBeenCalled();
      expect(globalThis.fetch).not.toHaveBeenCalled();
      (globalThis as typeof globalThis & { __DEV__: boolean }).__DEV__ = true;
    },
  );

  it('fails closed on RNG or malformed success, and never retries', async () => {
    mockRandom.mockRejectedValueOnce(new Error('no native random'));
    await expect(
      startMobileEnrollment('email', 'person@example.test'),
    ).rejects.toMatchObject({ reason: 'unavailable' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    globalThis.fetch = jest.fn(async () => ({
      status: 202,
      json: async () => ({
        challengeId,
        status: 'accepted',
        nextBrowserNonce: null,
        session: 'forbidden',
      }),
    })) as unknown as typeof fetch;
    await expect(
      startMobileEnrollment('email', 'person@example.test'),
    ).rejects.toMatchObject({ reason: 'restart' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('maps only verify 401 to incorrect and treats other failures as restart', async () => {
    globalThis.fetch = jest.fn(async () => ({
      status: 401,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    await expect(
      verifyMobileEnrollment(challengeId, '123456'),
    ).rejects.toMatchObject({ reason: 'incorrect' });
    await expect(
      startMobileEnrollment('email', 'person@example.test'),
    ).rejects.toMatchObject({ reason: 'restart' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});

// C19: passive observers do not alter envelopes, outcomes or retries.
describe('owned passive enrollment stages',()=>{
 const originalFetch=globalThis.fetch;
 afterEach(()=>{globalThis.fetch=originalFetch;});
 it('reports genuine stages and preserves one original request and accepted result',async()=>{
  (globalThis as typeof globalThis&{__DEV__:boolean}).__DEV__=true;Object.defineProperty(Platform,'OS',{value:'ios',configurable:true});mockRandom.mockResolvedValue(Uint8Array.from({length:32},()=>1));
  const stage=jest.fn(),observer={stage,retire:jest.fn()},client=createMobileEnrollmentClient('true','https://localhost:3443');globalThis.fetch=jest.fn(async()=>({status:202,json:async()=>({challengeId,status:'accepted',nextBrowserNonce:null})})) as unknown as typeof fetch;
  await expect(client.start('email','person@example.test',observer)).resolves.toEqual({challengeId,status:'accepted',nextBrowserNonce:null});expect(globalThis.fetch).toHaveBeenCalledTimes(1);expect(stage.mock.calls.map(([value])=>value)).toEqual(['config-accepted','entropy-accepted','fetch-entered','response-accepted','contract-accepted']);
 });
 it('separates pre-request configuration and entropy failures from network failure without retries',async()=>{
  (globalThis as typeof globalThis&{__DEV__:boolean}).__DEV__=true;Object.defineProperty(Platform,'OS',{value:'ios',configurable:true});
  const stage=jest.fn(),observer={stage,retire:jest.fn()};globalThis.fetch=jest.fn(async()=>{throw new Error('private-canary');}) as unknown as typeof fetch;
  await expect(createMobileEnrollmentClient('false','https://localhost:3443').start('email','person@example.test',observer)).rejects.toMatchObject({reason:'unavailable'});expect(stage.mock.calls.flat()).toEqual(['config-rejected']);expect(globalThis.fetch).not.toHaveBeenCalled();
  stage.mockClear();mockRandom.mockRejectedValueOnce(new Error('private-canary'));const client=createMobileEnrollmentClient('true','https://localhost:3443');await expect(client.start('email','person@example.test',observer)).rejects.toMatchObject({reason:'unavailable'});expect(stage.mock.calls.flat()).toEqual(['config-accepted','entropy-rejected']);expect(globalThis.fetch).not.toHaveBeenCalled();
  stage.mockClear();mockRandom.mockResolvedValue(Uint8Array.from({length:32},()=>1));await expect(client.start('email','person@example.test',observer)).rejects.toMatchObject({reason:'restart'});expect(stage.mock.calls.flat()).toEqual(['config-accepted','entropy-accepted','fetch-entered','fetch-rejected']);expect(globalThis.fetch).toHaveBeenCalledTimes(1);
 });
 it('reports response/contract rejection and preserves semantics even if an observer throws',async()=>{
  (globalThis as typeof globalThis&{__DEV__:boolean}).__DEV__=true;Object.defineProperty(Platform,'OS',{value:'ios',configurable:true});mockRandom.mockResolvedValue(Uint8Array.from({length:32},()=>1));const stage=jest.fn(),observer={stage,retire:jest.fn()},client=createMobileEnrollmentClient('true','https://localhost:3443');
  globalThis.fetch=jest.fn(async()=>({status:429,json:async()=>({})})) as unknown as typeof fetch;await expect(client.start('email','person@example.test',observer)).rejects.toMatchObject({reason:'limited'});expect(stage.mock.calls.flat()).toContain('response-other');
  stage.mockClear();globalThis.fetch=jest.fn(async()=>({status:202,json:async()=>({private:'private-canary'})})) as unknown as typeof fetch;await expect(client.start('email','person@example.test',observer)).rejects.toMatchObject({reason:'restart'});expect(stage.mock.calls.flat()).toContain('contract-rejected');
  globalThis.fetch=jest.fn(async()=>({status:202,json:async()=>({challengeId,status:'accepted',nextBrowserNonce:null})})) as unknown as typeof fetch;await expect(client.start('email','person@example.test',{stage:()=>{throw new Error('private-canary');},retire:()=>{}})).resolves.toMatchObject({status:'accepted'});expect(globalThis.fetch).toHaveBeenCalledTimes(1);
 });
});
