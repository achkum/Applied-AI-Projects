import { Platform } from 'react-native';
import { getRandomBytesAsync } from 'expo-crypto';
import type {
  MobileOtpStartBody,
  MobileOtpVerifyBody,
  OtpStartResponse,
  OtpVerifyResponse,
  StartV2OtpData,
  VerifyV2OtpData,
} from '../../../../packages/contracts/generated/types.gen';

declare const process: { env: Record<string, string | undefined> };

export type EnrollmentError =
  'unavailable' | 'restart' | 'incorrect' | 'limited';
export class EnrollmentRequestError extends Error {
  constructor(readonly reason: EnrollmentError) {
    super(reason);
  }
}

function baseUrl(
  enabled: string | undefined,
  configured: string | undefined,
): string {
  if (
    !(globalThis as typeof globalThis & { __DEV__?: boolean }).__DEV__ ||
    Platform.OS === 'web' ||
    enabled !== 'true' ||
    !configured
  ) {
    throw new EnrollmentRequestError('unavailable');
  }
  try {
    const url = new URL(configured);
    if (
      url.protocol !== 'https:' ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== '/' && url.pathname !== '')
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new EnrollmentRequestError('unavailable');
  }
}

async function freshKey(): Promise<string> {
  try {
    const bytes = await getRandomBytesAsync(32);
    if (!(bytes instanceof Uint8Array) || bytes.length !== 32)
      throw new Error();
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    );
  } catch {
    throw new EnrollmentRequestError('unavailable');
  }
}

function exact(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

async function post<T>(
  path: StartV2OtpData['url'] | VerifyV2OtpData['url'],
  body: MobileOtpStartBody | MobileOtpVerifyBody,
  status: number,
  validate: (value: unknown) => value is T,
  enabled: string | undefined,
  configured: string | undefined,
): Promise<T> {
  const origin = baseUrl(enabled, configured);
  const key = await freshKey();
  let response: Response;
  try {
    response = await fetch(`${origin}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify(body),
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
    });
  } catch {
    throw new EnrollmentRequestError('restart');
  }
  if (response.status !== status) {
    if (response.status === 401 && path === '/v2/auth/otp/verify')
      throw new EnrollmentRequestError('incorrect');
    if (response.status === 429) throw new EnrollmentRequestError('limited');
    throw new EnrollmentRequestError('restart');
  }
  try {
    const value: unknown = await response.json();
    if (validate(value)) return value;
  } catch {
    /* Invalid success response cannot be trusted. */
  }
  throw new EnrollmentRequestError('restart');
}

const secret = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);

export function createMobileEnrollmentClient(
  enabled: string | undefined,
  configured: string | undefined,
) {
  const start = async (
    channel: 'email' | 'phone',
    identifier: string,
  ): Promise<OtpStartResponse> => {
    const body: MobileOtpStartBody = {
      channel: channel === 'phone' ? 'sms' : 'email',
      identifier,
      purpose: 'enroll_identifier',
      transport: 'mobile',
    };
    return post(
      '/v2/auth/otp/start',
      body,
      202,
      (value): value is OtpStartResponse =>
        exact(value, ['challengeId', 'status', 'nextBrowserNonce']) &&
        secret(value.challengeId) &&
        value.status === 'accepted' &&
        value.nextBrowserNonce === null,
      enabled,
      configured,
    );
  };

  const verify = async (
    challengeId: string,
    code: string,
  ): Promise<OtpVerifyResponse> => {
    if (!secret(challengeId) || !/^\d{6}$/.test(code))
      throw new EnrollmentRequestError('restart');
    const body: MobileOtpVerifyBody = {
      challengeId,
      code,
      transport: 'mobile',
    };
    return post(
      '/v2/auth/otp/verify',
      body,
      200,
      (value): value is OtpVerifyResponse =>
        exact(value, ['purpose', 'proof', 'nextBrowserNonce']) &&
        value.purpose === 'enroll_identifier' &&
        typeof value.proof === 'string' &&
        /^v2\.[A-Za-z0-9_-]{43}$/.test(value.proof) &&
        value.nextBrowserNonce === null,
      enabled,
      configured,
    );
  };
  return { start, verify };
}

const client = createMobileEnrollmentClient(
  process.env.EXPO_PUBLIC_MOBILE_ENROLLMENT_ENABLED,
  process.env.EXPO_PUBLIC_MOBILE_ENROLLMENT_HTTPS_URL,
);
export const startMobileEnrollment = client.start;
export const verifyMobileEnrollment = client.verify;
