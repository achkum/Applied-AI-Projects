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
