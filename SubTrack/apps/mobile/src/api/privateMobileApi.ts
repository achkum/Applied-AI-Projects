import { getRandomBytesAsync } from 'expo-crypto';
import { getPrivateRuntime } from '@/config/privateRuntime';
import { PRIVATE_MOBILE_PATHS, parsePrivateMobileEnrollmentComplete, parsePrivateMobileLoginVerify, parsePrivateMobileLoginVerified,
  parsePrivateMobileSessionRequest, parsePrivateMobileSessionResponse } from '@subtrack/contracts/private-mobile';
import { parseProfilePatch, parseProfileView, parseJustMeChoice } from '@subtrack/contracts/profile';
import { parseModeView, parsePrivateOwnerPageRequest, parsePrivateOwnerPage, parsePrivateManualCreate, parsePrivateManualCreated } from '@subtrack/contracts/private-onboarding';
import type { ProfilePatch } from '../../../../packages/contracts/generated/types.gen';
import type { NativeCredentials } from '@/utils/secureSessionBundle';

export class PrivateMobileRequestError extends Error {
  constructor() { super('Fresh verification required'); this.name = 'PrivateMobileRequestError'; }
}
async function key(manual = false): Promise<string> {
  const bytes = await getRandomBytesAsync(manual ? 16 : 32);
  if (!(bytes instanceof Uint8Array) || bytes.length !== (manual ? 16 : 32)) throw new PrivateMobileRequestError();
  if (manual) { bytes[6] = (bytes[6]! & 15) | 64; bytes[8] = (bytes[8]! & 63) | 128; }
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return manual ? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` : hex;
}
async function request<T>(path: string, body: unknown, status: number, decode: (value: unknown) => T, signal: AbortSignal,
  credential?: { kind: 'Bearer' | 'Refresh'; token: string }, manual = false): Promise<T> {
  const runtime = getPrivateRuntime();
  if (!runtime || signal.aborted) throw new PrivateMobileRequestError();
  const controller = new AbortController(); const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const deadline = setTimeout(abort, 15000);
  try {
    if (credential && !/^[A-Za-z0-9_.-]{1,4096}$/.test(credential.token)) throw new PrivateMobileRequestError();
    const keyPaths: readonly string[] = [PRIVATE_MOBILE_PATHS.complete, PRIVATE_MOBILE_PATHS.verifyLogin, PRIVATE_MOBILE_PATHS.session,
      PRIVATE_MOBILE_PATHS.refresh, PRIVATE_MOBILE_PATHS.manual];
    const needsKey = keyPaths.includes(path);
    const response = await fetch(runtime.apiBaseUrl + path, { method: 'POST', signal: controller.signal, credentials: 'omit',
      redirect: 'error', cache: 'no-store', headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(needsKey ? { 'Idempotency-Key': await key(manual) } : {}),
        ...(credential ? { Authorization: `${credential.kind} ${credential.token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (signal.aborted || controller.signal.aborted || response.status !== status || response.headers.get('cache-control') !== 'no-store') throw new PrivateMobileRequestError();
    if (status === 204) return decode(null);
    if (response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') throw new PrivateMobileRequestError();
    const raw = await response.text();
    if (signal.aborted || controller.signal.aborted || raw.length > 131072) throw new PrivateMobileRequestError();
    return decode(JSON.parse(raw) as unknown);
  } catch { throw new PrivateMobileRequestError(); }
  finally { clearTimeout(deadline); signal.removeEventListener('abort', abort); }
}
export async function completeNativeEnrollment(proof: string, locale: 'sv' | 'en', signal: AbortSignal): Promise<NativeCredentials> {
  return request(PRIVATE_MOBILE_PATHS.complete, parsePrivateMobileEnrollmentComplete({ transport: 'mobile', enrollmentProof: proof, locale }), 201, parsePrivateMobileSessionResponse, signal);
}
export async function verifiedNativeLogin(signal: AbortSignal): Promise<NativeCredentials> {
  const verified = await request(PRIVATE_MOBILE_PATHS.verifyLogin, parsePrivateMobileLoginVerify({ transport: 'mobile' }), 200, parsePrivateMobileLoginVerified, signal);
  return request(PRIVATE_MOBILE_PATHS.session, parsePrivateMobileSessionRequest({ transport: 'mobile', loginProof: verified.loginProof }), 201, parsePrivateMobileSessionResponse, signal);
}
export function rotateNativeSession(credentials: NativeCredentials, signal: AbortSignal) {
  return request(PRIVATE_MOBILE_PATHS.refresh, undefined, 200, parsePrivateMobileSessionResponse, signal, { kind: 'Refresh', token: credentials.refreshToken });
}
export function revokeNativeSession(credentials: NativeCredentials, signal: AbortSignal) {
  return request(PRIVATE_MOBILE_PATHS.logout, {}, 204, () => undefined, signal, { kind: 'Bearer', token: credentials.accessToken });
}
export const readNativeProfile = (token: string, signal: AbortSignal) => request(PRIVATE_MOBILE_PATHS.profileRead, {}, 200, parseProfileView, signal, { kind: 'Bearer', token });
export const saveNativeProfile = (body: ProfilePatch, token: string, signal: AbortSignal) => request(PRIVATE_MOBILE_PATHS.profile, parseProfilePatch(body), 200, parseProfileView, signal, { kind: 'Bearer', token });
export const readNativeMode = (token: string, signal: AbortSignal) => request(PRIVATE_MOBILE_PATHS.modeRead, {}, 200, parseModeView, signal, { kind: 'Bearer', token });
export const chooseNativeJustMe = (token: string, signal: AbortSignal) => request(PRIVATE_MOBILE_PATHS.mode, parseJustMeChoice({ mode: 'just-me' }), 200, parseModeView, signal, { kind: 'Bearer', token });
export const readNativeSubscriptions = (token: string, signal: AbortSignal, cursor?: string) =>
  request(PRIVATE_MOBILE_PATHS.ownerRead, parsePrivateOwnerPageRequest(cursor === undefined ? {} : { cursor }), 200, parsePrivateOwnerPage, signal, { kind: 'Bearer', token });
export const createNativeSubscription = (body: ReturnType<typeof parsePrivateManualCreate>, token: string, signal: AbortSignal) =>
  request(PRIVATE_MOBILE_PATHS.manual, parsePrivateManualCreate(body), 201, parsePrivateManualCreated, signal, { kind: 'Bearer', token }, true);
