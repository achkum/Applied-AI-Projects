import type {
  BrowserNonceRequest,
  BrowserNonceResponse,
  OtpStartRequest,
  OtpStartResponse,
  OtpVerifyRequest,
  OtpVerifyResponse,
  V2Problem,
  WebEnrollmentPendingResponse,
  WebEnrollmentSimulatorResponse,
  WebSessionResponse,
} from '@subtrack/contracts';

export class RegistrationApiError extends Error {
  constructor(readonly code: 'unavailable' | 'restart-required' | 'login-required') {
    super(code);
    this.name = 'RegistrationApiError';
  }
}

const MAX_RESPONSE_BYTES = 32 * 1024;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const PROOF = /^v2\.[A-Za-z0-9_-]{43}$/;
const PENDING = /^wep\.[A-Za-z0-9_-]{43}$/;
const VERIFIED = /^wev\.[A-Za-z0-9_-]{43}$/;

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Request aborted', 'AbortError');
}

async function readPayload(response: Response, signal: AbortSignal, expectedMediaType: string): Promise<unknown> {
  const mediaType = response.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase();
  if (!response.body || mediaType !== expectedMediaType) {
    await response.body?.cancel();
    throw new RegistrationApiError('unavailable');
  }
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', cancel, { once: true });
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      throwIfAborted(signal);
      const chunk = await reader.read();
      throwIfAborted(signal);
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new RegistrationApiError('unavailable');
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch {
    cancel();
    throwIfAborted(signal);
    throw new RegistrationApiError('unavailable');
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

async function post<T>(
  path: string,
  body: object,
  signal: AbortSignal,
  status: number,
  decode: (payload: unknown) => T,
  nonce?: string,
): Promise<T> {
  throwIfAborted(signal);
  let response: Response;
  try {
    response = await fetch(`/v2/auth/${path}`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
        ...(nonce ? { 'X-Browser-Nonce': nonce } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new RegistrationApiError('unavailable');
  }

  if (signal.aborted) {
    await response.body?.cancel();
    throwIfAborted(signal);
  }
  if (response.status !== status && response.status !== 409) {
    await response.body?.cancel();
    throw new RegistrationApiError('unavailable');
  }
  const payload = await readPayload(response, signal, response.status === 409 ? 'application/problem+json' : 'application/json');
  throwIfAborted(signal);
  if (response.status === 409 && isEnrollmentProblem(payload, 'ENROLLMENT_LOGIN_REQUIRED')) {
    throw new RegistrationApiError('login-required');
  }
  if (response.status === 409 && ((path.startsWith('enrollment/') && isEnrollmentProblem(payload, 'AUTH_RESTART_REQUIRED')) ||
      (!path.startsWith('enrollment/') && isRestartProblem(payload)))) {
    throw new RegistrationApiError('restart-required');
  }
  if (response.status !== status) {
    throw new RegistrationApiError('unavailable');
  }
  return decode(payload);
}

function isRestartProblem(payload: unknown): boolean {
  if (!isRecord(payload) || payload.type !== 'about:blank' || payload.title !== 'Conflict' ||
      payload.status !== 409 || payload.code !== 'AUTH_RESTART_REQUIRED' || Object.keys(payload).length !== 4) return false;
  const problem: V2Problem = { type: payload.type, title: payload.title, status: payload.status, code: payload.code };
  return problem.code === 'AUTH_RESTART_REQUIRED';
}

function isEnrollmentProblem(value: unknown, code: string): boolean {
  return hasExactKeys(value, ['type', 'title', 'status', 'code']) && value.type === 'about:blank' &&
    value.title === 'Authentication unavailable' && value.status === 409 && value.code === code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isBoundedString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 4096;
}

// Match the generated closed response schemas, then narrow to web enrollment.
function decodeNonce(value: unknown): BrowserNonceResponse {
  if (!hasExactKeys(value, ['nonce']) || typeof value.nonce !== 'string' || !TOKEN.test(value.nonce)) throw new RegistrationApiError('unavailable');
  return { nonce: value.nonce };
}

function decodeStart(value: unknown): OtpStartResponse & StartedRegistration {
  if (!hasExactKeys(value, ['challengeId', 'status', 'nextBrowserNonce']) ||
      !isBoundedString(value.challengeId) || value.status !== 'accepted' || typeof value.nextBrowserNonce !== 'string' || !TOKEN.test(value.nextBrowserNonce)) {
    throw new RegistrationApiError('unavailable');
  }
  return { challengeId: value.challengeId, status: 'accepted', nextBrowserNonce: value.nextBrowserNonce };
}

function decodeVerify(value: unknown): OtpVerifyResponse & VerifiedRegistration {
  if (!hasExactKeys(value, ['purpose', 'proof', 'nextBrowserNonce']) || value.purpose !== 'enroll_identifier' ||
      typeof value.proof !== 'string' || !PROOF.test(value.proof) || typeof value.nextBrowserNonce !== 'string' || !TOKEN.test(value.nextBrowserNonce)) throw new RegistrationApiError('unavailable');
  return { purpose: 'enroll_identifier', proof: value.proof, nextBrowserNonce: value.nextBrowserNonce };
}

function decodePending(value: unknown): WebEnrollmentPendingResponse {
  if (!hasExactKeys(value, ['transport', 'continuation', 'status', 'nextBrowserNonce']) ||
      value.transport !== 'web' || value.status !== 'pending' || typeof value.continuation !== 'string' ||
      !PENDING.test(value.continuation) || typeof value.nextBrowserNonce !== 'string' || !TOKEN.test(value.nextBrowserNonce))
    throw new RegistrationApiError('unavailable');
  return { transport: 'web', continuation: value.continuation, status: 'pending', nextBrowserNonce: value.nextBrowserNonce };
}

function decodeSimulator(value: unknown): WebEnrollmentSimulatorResponse {
  if (!hasExactKeys(value, ['transport', 'verifiedEnrollment', 'status', 'nextBrowserNonce']) ||
      value.transport !== 'web' || value.status !== 'verified' || typeof value.verifiedEnrollment !== 'string' ||
      !VERIFIED.test(value.verifiedEnrollment) || typeof value.nextBrowserNonce !== 'string' || !TOKEN.test(value.nextBrowserNonce))
    throw new RegistrationApiError('unavailable');
  return { transport: 'web', verifiedEnrollment: value.verifiedEnrollment, status: 'verified', nextBrowserNonce: value.nextBrowserNonce };
}

function decodeComplete(value: unknown): WebSessionResponse {
  if (!hasExactKeys(value, ['transport', 'sessionId', 'csrfToken']) || value.transport !== 'web' ||
      typeof value.sessionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.sessionId) ||
      !isBoundedString(value.csrfToken)) throw new RegistrationApiError('unavailable');
  return { transport: 'web', sessionId: value.sessionId, csrfToken: value.csrfToken };
}

async function bootstrap(signal: AbortSignal): Promise<string> {
  const request: BrowserNonceRequest = { purpose: 'enroll_identifier' };
  const response = await post('browser-nonce', request, signal, 200, decodeNonce);
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
  const response = await post('otp/start', request, signal, 202, decodeStart, nonce);
  return { challengeId: response.challengeId, nextBrowserNonce: response.nextBrowserNonce };
}

export async function verifyRegistration(
  challengeId: string,
  code: string,
  nonce: string,
  signal: AbortSignal,
): Promise<VerifiedRegistration> {
  const request: OtpVerifyRequest = { challengeId, code, transport: 'web' };
  const response = await post('otp/verify', request, signal, 200, decodeVerify, nonce);
  return { purpose: 'enroll_identifier', proof: response.proof, nextBrowserNonce: response.nextBrowserNonce };
}

export function admitPendingRegistration(identifierProof: string, nonce: string, signal: AbortSignal) {
  if (!PROOF.test(identifierProof) || !TOKEN.test(nonce)) throw new RegistrationApiError('unavailable');
  return post('enrollment/pending', { transport: 'web', identifierProof }, signal, 201, decodePending, nonce);
}

export function verifySimulatorRegistration(continuation: string, nonce: string, signal: AbortSignal, demoIdentity: 'alice' | 'bob' = 'alice') {
  if (!PENDING.test(continuation) || !TOKEN.test(nonce)) throw new RegistrationApiError('unavailable');
  if (demoIdentity !== 'alice' && demoIdentity !== 'bob') throw new RegistrationApiError('unavailable');
  return post('enrollment/simulator/verify', { transport: 'web', continuation,
    ...(demoIdentity === 'alice' ? {} : { demoIdentity }) }, signal, 200, decodeSimulator, nonce);
}

export function completeRegistration(verifiedEnrollment: string, nonce: string, signal: AbortSignal) {
  if (!VERIFIED.test(verifiedEnrollment) || !TOKEN.test(nonce)) throw new RegistrationApiError('unavailable');
  return post('enrollment/complete', { transport: 'web', verifiedEnrollment }, signal, 201, decodeComplete, nonce);
}
