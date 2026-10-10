import type {
  BrowserNonceRequest,
  BrowserNonceResponse,
  OtpStartRequest,
  OtpStartResponse,
  OtpVerifyRequest,
  OtpVerifyResponse,
} from '@subtrack/contracts';

export class RegistrationApiError extends Error {
  constructor(readonly code: 'unavailable' | 'restart-required') {
    super(code);
    this.name = 'RegistrationApiError';
  }
}

function idempotencyKey(): string {
  return crypto.randomUUID();
}

async function post<T>(path: string, body: object, signal: AbortSignal, nonce?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v2/auth/${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey(),
        ...(nonce ? { 'X-Browser-Nonce': nonce } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new RegistrationApiError('unavailable');
  }

  if (signal.aborted) throw new DOMException('Request aborted', 'AbortError');

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new RegistrationApiError('unavailable');
  }
  if (response.status === 409 && isRestartProblem(payload)) {
    throw new RegistrationApiError('restart-required');
  }
  if (!response.ok || typeof payload !== 'object' || payload === null) {
    throw new RegistrationApiError('unavailable');
  }
  return payload as T;
}

function isRestartProblem(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null || !('code' in payload)) return false;
  return payload.code === 'AUTH_RESTART_REQUIRED';
}

function hasString<K extends string>(value: unknown, key: K): value is Record<K, string> {
  if (typeof value !== 'object' || value === null || !Object.hasOwn(value, key)) return false;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' && field.length > 0 && field.length <= 4096;
}

async function bootstrap(signal: AbortSignal): Promise<string> {
  const request: BrowserNonceRequest = { purpose: 'enroll_identifier' };
  const response = await post<BrowserNonceResponse>('browser-nonce', request, signal);
  if (!hasString(response, 'nonce') || response.nonce.length === 0) throw new RegistrationApiError('unavailable');
  return response.nonce;
}

export interface RegistrationIdentifier {
  channel: 'sms' | 'email';
  identifier: string;
}

export interface StartedRegistration {
  challengeId: string;
  nextBrowserNonce: string;
}

export interface VerifiedRegistration {
  purpose: 'enroll_identifier';
  proof: string;
  nextBrowserNonce: string;
}

export async function startRegistration(
  value: RegistrationIdentifier,
  signal: AbortSignal,
): Promise<StartedRegistration> {
  const nonce = await bootstrap(signal);
  const request: OtpStartRequest = {
    channel: value.channel,
    identifier: value.identifier,
    purpose: 'enroll_identifier',
    transport: 'web',
  };
  const response = await post<OtpStartResponse>('otp/start', request, signal, nonce);
  if (!hasString(response, 'challengeId') || response.challengeId.length === 0 ||
      !hasString(response, 'status') || response.status !== 'accepted' ||
      !hasString(response, 'nextBrowserNonce') || response.nextBrowserNonce.length === 0) {
    throw new RegistrationApiError('unavailable');
  }
  return { challengeId: response.challengeId, nextBrowserNonce: response.nextBrowserNonce };
}

export async function verifyRegistration(
  challengeId: string,
  code: string,
  nonce: string,
  signal: AbortSignal,
): Promise<VerifiedRegistration> {
  const request: OtpVerifyRequest = { challengeId, code, transport: 'web' };
  const response = await post<OtpVerifyResponse>('otp/verify', request, signal, nonce);
  if (!hasString(response, 'purpose') || response.purpose !== 'enroll_identifier' ||
      !hasString(response, 'proof') || response.proof.length === 0 ||
      !hasString(response, 'nextBrowserNonce') || response.nextBrowserNonce.length === 0) {
    throw new RegistrationApiError('unavailable');
  }
  return { purpose: 'enroll_identifier', proof: response.proof, nextBrowserNonce: response.nextBrowserNonce };
}
