import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getRandomBytesAsync } from 'expo-crypto';
import { SANDBOX_MOBILE_PATHS, parseSandboxBootstrap, parseSandboxTransport, parseSandboxBusiness,
  parseSandboxCredentials, parseSandboxRequestKey, parseSandboxSecret, parseSandboxProblem, sandboxObject,
  parseSandboxBankHistory, type SandboxBusinessOperation, type SandboxCredentials } from '@subtrack/contracts/sandbox-mobile';
import { parseProfileView } from '@subtrack/contracts/profile';
import { parseModeView, parsePrivateOwnerPage, parsePrivateManualCreated, parsePrivateManualEdited,
  parsePrivateLifecycleResult } from '@subtrack/contracts/private-onboarding';
import { readSandboxMarker, resolveSandboxRuntime } from '@/config/sandboxRuntime';
import {parsePrivateMobileBankReadResult,parsePrivateMobileBankMutationResult} from '@subtrack/contracts/private-mobile-bank';
import {parsePrivateMobileDetectionReadResult,parsePrivateMobileDetectionReviewResult,parsePrivateMobileDetectionScanResult} from '@subtrack/contracts/private-mobile-detection';
import type {BankIntent,BankConflict} from './privateMobileBank';
import type {DetectionIntent,DetectionConflict} from './privateMobileDetection';
import type {SandboxHouseholdOperation} from '@subtrack/contracts/sandbox-household';
import type { NativeMutationConflict } from './privateMobileApi';

export class SandboxRequestError extends Error {
  constructor() { super('Sandbox request unavailable'); this.name = 'SandboxRequestError'; }
}
type Ports = Readonly<{ runtime: () => { apiBaseUrl: string } | null; fetch: typeof fetch;
  entropy: (size: number) => Promise<Uint8Array> }>;
function tokenObject(part: string): Record<string, unknown> {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let bits = 0, width = 0, text = '';
  for (const char of part) { const value = alphabet.indexOf(char);
    bits = (bits << 6) | value; width += 6; if (width >= 8) { width -= 8; const byte = (bits >> width) & 255;
      if (byte > 127) throw new SandboxRequestError(); text += String.fromCharCode(byte); bits &= (1 << width) - 1; } }
  if (bits !== 0 || width >= 6) throw new SandboxRequestError();
  const value: unknown = JSON.parse(text); if (JSON.stringify(value) !== text || !value || typeof value !== 'object' || Array.isArray(value)) throw new SandboxRequestError();
  return value as Record<string, unknown>;
}
function sandboxAccess(token: string, sessionId?: string): string {
  if (token.length > 4096 || !/^[-_A-Za-z0-9]+\.[-_A-Za-z0-9]+\.[-_A-Za-z0-9]+$/.test(token)) throw new SandboxRequestError();
  const [h, p] = token.split('.'), header = sandboxObject(tokenObject(h!), ['alg', 'typ', 'kid']), claims = sandboxObject(tokenObject(p!), ['iss', 'aud', 'sub', 'sid', 'iat', 'exp', 'ver']);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  if (header.alg !== 'EdDSA' || header.typ !== 'subtrack-sandbox-access+jwt' || header.kid !== 'st250-sandbox-v1' ||
    claims.iss !== 'urn:subtrack:auth:v2:sandbox' || claims.aud !== 'urn:subtrack:api:v2:sandbox' || claims.ver !== 2 ||
    typeof claims.sub !== 'string' || !uuid.test(claims.sub) || typeof claims.sid !== 'string' || !uuid.test(claims.sid) ||
    (sessionId !== undefined && claims.sid !== sessionId) || !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) ||
    (claims.iat as number) < 0 || (claims.exp as number) <= (claims.iat as number) || (claims.exp as number) > (claims.iat as number) + 900) throw new SandboxRequestError();
  return `Bearer ${token}`;
}
function credentials(value: unknown, bootstrap: false): SandboxCredentials;
function credentials(value: unknown, bootstrap: true): ReturnType<typeof parseSandboxCredentials>;
function credentials(value: unknown, bootstrap: boolean) {
  const parsed = bootstrap ? parseSandboxCredentials(value, true) : parseSandboxCredentials(value, false);
  sandboxAccess(parsed.accessToken, parsed.sessionId); return parsed;
}
type SandboxConflict=NativeMutationConflict|BankConflict|DetectionConflict;
function knownConflict(value: unknown): SandboxConflict {
  const v = parseSandboxProblem(value);
  if (v.status !== 409 ||
    !['MANUAL_EDIT_CONFLICT', 'MANUAL_EDIT_IDEMPOTENCY_CONFLICT', 'LIFECYCLE_CONFLICT','MODE_CONFLICT','BANK_STATE_CONFLICT','BANK_IDEMPOTENCY_CONFLICT','DETECTION_STATE_CONFLICT','DETECTION_IDEMPOTENCY_CONFLICT','UNDO_EXPIRED'].includes(v.code as string)) throw new SandboxRequestError();
  return { conflict: v.code as SandboxConflict['conflict'] };
}
/** Injectable transport; the real composition accepts only the reviewed isolated build marker. */
export function createSandboxMobileApi(ports: Ports) {
  async function key() {
    const bytes = await ports.entropy(16);
    if (!(bytes instanceof Uint8Array) || bytes.length !== 16) throw new SandboxRequestError();
    const copy = Uint8Array.from(bytes); copy[6] = (copy[6]! & 15) | 64; copy[8] = (copy[8]! & 63) | 128;
    const hex = Array.from(copy, byte => byte.toString(16).padStart(2, '0')).join('');
    return parseSandboxRequestKey(`${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`);
  }
  async function request<T>(path: string, body: object | undefined, status: number, decode: (v: unknown) => T,
    signal: AbortSignal, authorization?: string, needsKey = false, conflict = false, intentKey?: string): Promise<T | SandboxConflict> {
    const runtime = ports.runtime();
    if (!runtime || runtime.apiBaseUrl !== 'https://198.44.116.159' || signal.aborted) throw new SandboxRequestError();
    const controller = new AbortController(), abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true }); const deadline = setTimeout(abort, 10000);
    try {
      const intent = needsKey ? intentKey===undefined?await key():parseSandboxRequestKey(intentKey) : undefined;
      if (signal.aborted || controller.signal.aborted) throw new SandboxRequestError();
      const response = await ports.fetch(runtime.apiBaseUrl + path, { method: 'POST', credentials: 'omit', redirect: 'error',
        cache: 'no-store', signal: controller.signal, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(authorization ? { Authorization: authorization } : {}), ...(intent ? { 'Idempotency-Key': intent } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      if (signal.aborted || controller.signal.aborted || response.headers.get('cache-control') !== 'no-store') throw new SandboxRequestError();
      if (status === 204 && response.status === 204) return decode(null);
      const isConflict = conflict && response.status === 409;
      if (!isConflict && response.status !== status) throw new SandboxRequestError();
      const media = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      if (media !== (isConflict ? 'application/problem+json' : 'application/json')) throw new SandboxRequestError();
      const raw = await response.text();
      if (signal.aborted || controller.signal.aborted || raw.length > (isConflict ? 4096 : 131072)) throw new SandboxRequestError();
      return isConflict ? knownConflict(JSON.parse(raw) as unknown) : decode(JSON.parse(raw) as unknown);
    } catch { throw new SandboxRequestError(); }
    finally { clearTimeout(deadline); signal.removeEventListener('abort', abort); }
  }
  async function business<T>(operation: SandboxBusinessOperation, body: unknown, token: string, signal: AbortSignal,
    decode: (value: unknown) => T, status = 200, conflict = false, intentKey?:string) {
    return request(SANDBOX_MOBILE_PATHS.business, parseSandboxBusiness({ operation, body }), status, decode, signal,
      sandboxAccess(token), operation === 'manual' || operation === 'manual-edit'||operation==='subscription-edit'||['bank-connect','bank-sync','bank-disconnect','detection-scan','detection-confirm','detection-reject','detection-undo'].includes(operation), conflict, intentKey);
  }
  return Object.freeze({
    householdBusiness: async <T,>(operation:SandboxHouseholdOperation,body:unknown,token:string,signal:AbortSignal,decode:(value:unknown)=>T):Promise<T> => business(operation,body,token,signal,decode) as Promise<T>,
    readNativeBankHistory: (token:string,signal:AbortSignal) => business('bank-history',{},token,signal,parseSandboxBankHistory) as Promise<ReturnType<typeof parseSandboxBankHistory>>,
    readNativeBank: async(token:string,signal:AbortSignal) => {
      const result=await business('bank-read',{},token,signal,parsePrivateMobileBankReadResult,200,true);
      if('conflict'in result){if(result.conflict!=='MODE_CONFLICT')throw new SandboxRequestError();return {kind:'setup-required'} as const;}
      return {kind:'ready',connections:result.connections} as const;
    },
    mutateNativeBank: async(intent:BankIntent,requestKey:string,token:string,signal:AbortSignal) => {
      const body=intent.operation==='connect'?{institutionId:intent.institutionId}:intent.operation==='sync'?{connectionId:intent.connectionId}:{connectionId:intent.connectionId,purge:intent.purge};
      const result=await business(`bank-${intent.operation}`,body,token,signal,parsePrivateMobileBankMutationResult,200,true,requestKey);
      if(!('conflict'in result)&&(result.operation!==intent.operation||'connectionId'in intent&&result.connection.connectionId!==intent.connectionId))throw new SandboxRequestError();
      return result as ReturnType<typeof parsePrivateMobileBankMutationResult>|BankConflict;
    },
    readNativeDetections: async(token:string,signal:AbortSignal,cursor?:string) => {
      const result=await business('detection-read',cursor===undefined?{}:{cursor},token,signal,parsePrivateMobileDetectionReadResult,200,true);
      if('conflict'in result){if(result.conflict!=='MODE_CONFLICT')throw new SandboxRequestError();return {kind:'setup-required'} as const;}
      return {kind:'ready',...result} as const;
    },
    mutateNativeDetection: async(intent:DetectionIntent,requestKey:string,token:string,signal:AbortSignal) => {
      const body=intent.operation==='scan'?{}:intent.operation==='undo'?{receiptId:intent.receiptId}:{candidateId:intent.candidateId,expectedRevision:intent.expectedRevision};
      if(intent.operation==='scan')return business('detection-scan',body,token,signal,parsePrivateMobileDetectionScanResult,200,true,requestKey) as Promise<ReturnType<typeof parsePrivateMobileDetectionScanResult>|DetectionConflict>;
      const result=await business(`detection-${intent.operation}`,body,token,signal,parsePrivateMobileDetectionReviewResult,200,true,requestKey);
      if(!('conflict'in result)&&(result.candidateId!==intent.candidateId||result.status!==(intent.operation==='confirm'?'ACTIVE':intent.operation==='reject'?'REJECTED':'DETECTED')))throw new SandboxRequestError();
      return result as ReturnType<typeof parsePrivateMobileDetectionReviewResult>|DetectionConflict;
    },
    bootstrap: async (locale: 'sv' | 'en', signal: AbortSignal) => request(SANDBOX_MOBILE_PATHS.bootstrap,
      parseSandboxBootstrap({ transport: 'sandbox-mobile', locale }), 201, v => credentials(v, true), signal, undefined, true) as Promise<ReturnType<typeof parseSandboxCredentials> & { installationCapability: string }>,
    resume: async (capability: string, signal: AbortSignal) => request(SANDBOX_MOBILE_PATHS.resume,
      parseSandboxTransport({ transport: 'sandbox-mobile' }), 201, v => credentials(v, false), signal,
      `SandboxCapability ${parseSandboxSecret(capability, 'capability')}`, true) as Promise<SandboxCredentials>,
    refresh: async (credentials: SandboxCredentials, signal: AbortSignal) => request(SANDBOX_MOBILE_PATHS.refresh, undefined,
      200, v => parseSandboxCredentials(v, false), signal, `SandboxRefresh ${parseSandboxSecret(credentials.refreshToken, 'refresh')}`, true).then(value => { const parsed = value as SandboxCredentials; sandboxAccess(parsed.accessToken, parsed.sessionId); return parsed; }),
    logout: async (credentials: SandboxCredentials, signal: AbortSignal) => { await request(SANDBOX_MOBILE_PATHS.logout,
      parseSandboxTransport({ transport: 'sandbox-mobile' }), 204, () => undefined, signal, sandboxAccess(credentials.accessToken)); },
    readNativeProfile: (token: string, signal: AbortSignal) => business('profile-read', {}, token, signal, parseProfileView) as Promise<ReturnType<typeof parseProfileView>>,
    saveNativeProfile: (body: Parameters<typeof parseSandboxBusiness>[0], token: string, signal: AbortSignal) => business('profile', body, token, signal, parseProfileView) as Promise<ReturnType<typeof parseProfileView>>,
    readNativeMode: (token: string, signal: AbortSignal) => business('mode-read', {}, token, signal, parseModeView) as Promise<ReturnType<typeof parseModeView>>,
    chooseNativeJustMe: (token: string, signal: AbortSignal) => business('mode', { mode: 'just-me' }, token, signal, parseModeView) as Promise<ReturnType<typeof parseModeView>>,
    readNativeSubscriptions: async (token: string, signal: AbortSignal, cursor?: string) => {
      const page = await business('owner-read', cursor === undefined ? {} : { cursor }, token, signal, parsePrivateOwnerPage) as ReturnType<typeof parsePrivateOwnerPage>;
      if (page.items.some(row => !['MANUAL','DETECTED'].includes(row.source) || row.currency !== 'SEK' || !row.alwaysPrivate)) throw new SandboxRequestError();
      return page;
    },
    createNativeSubscription: (body: unknown, token: string, signal: AbortSignal) => business('manual', body, token, signal, parsePrivateManualCreated, 201) as Promise<ReturnType<typeof parsePrivateManualCreated>>,
    editNativeSubscription: (body: unknown, token: string, signal: AbortSignal) => business('subscription-edit', body, token, signal, parsePrivateManualEdited, 200, true) as Promise<ReturnType<typeof parsePrivateManualEdited>|NativeMutationConflict>,
    updateNativeSubscriptionStatus: (body: unknown, token: string, signal: AbortSignal) => business('subscription-status', body, token, signal, parsePrivateLifecycleResult, 200, true) as Promise<ReturnType<typeof parsePrivateLifecycleResult>|NativeMutationConflict>,
  });
}
export type SandboxMobileApi = ReturnType<typeof createSandboxMobileApi>;
export const sandboxMobileApi = createSandboxMobileApi({ runtime: () => resolveSandboxRuntime({ marker: readSandboxMarker(Constants.expoConfig), platform: Platform.OS }),
  fetch: (...args) => globalThis.fetch(...args), entropy: getRandomBytesAsync });
