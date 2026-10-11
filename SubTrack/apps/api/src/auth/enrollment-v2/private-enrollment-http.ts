import type { IncomingMessage, ServerResponse } from 'node:http';
import { TLSSocket } from 'node:tls';
import type { DurableDevelopmentEnrollment, EnrollmentWeb } from './durable-development-enrollment.js';
import type { V2AccessToken } from '../sessions-v2/v2-access-token.js';
import type { createDevelopmentBootstrapTransaction } from '../browser-nonce/development-bootstrap-transaction.js';

const ORIGIN = 'https://localhost:3443';
const SECRET = /^[A-Za-z0-9_-]{43}$/;
export const canonicalPrivateSecret = (value: string): boolean =>
  SECRET.test(value) && Buffer.from(value, 'base64url').length === 32 &&
  Buffer.from(value, 'base64url').toString('base64url') === value;
const KEY = /^[\x21-\x7e]{16,255}$/;
const PROBLEM: Record<number, Readonly<{ type: 'about:blank'; title: string; status: number; code: string }>> = {
  400: { type: 'about:blank', title: 'Authentication unavailable', status: 400, code: 'INVALID_ENROLLMENT_REQUEST' },
  401: { type: 'about:blank', title: 'Authentication unavailable', status: 401, code: 'ENROLLMENT_AUTHORITY_INVALID' },
  403: { type: 'about:blank', title: 'Authentication unavailable', status: 403, code: 'AUTH_ORIGIN_REJECTED' },
  404: { type: 'about:blank', title: 'Authentication unavailable', status: 404, code: 'ENROLLMENT_UNAVAILABLE' },
  409: { type: 'about:blank', title: 'Authentication unavailable', status: 409, code: 'AUTH_RESTART_REQUIRED' },
  429: { type: 'about:blank', title: 'Authentication unavailable', status: 429, code: 'ENROLLMENT_RATE_LIMITED' },
  500: { type: 'about:blank', title: 'Authentication unavailable', status: 500, code: 'INTERNAL_ERROR' },
};
export function privateJson(response: ServerResponse, status: number, body: object, problem = false, cookies?: string[]): void {
  response.setHeader('Cache-Control', 'no-store'); response.setHeader('Pragma', 'no-cache');
  response.setHeader('Content-Type', problem ? 'application/problem+json' : 'application/json');
  if (cookies) response.setHeader('Set-Cookie', cookies);
  response.statusCode = status; response.end(JSON.stringify(body));
}
export function privateProblem(response: ServerResponse, status: number, loginRequired = false): void {
  privateJson(response, status, loginRequired ? { ...PROBLEM[409]!, code: 'ENROLLMENT_LOGIN_REQUIRED' } : PROBLEM[status] ?? PROBLEM[500]!, true);
}
// The accepted durable core deliberately collapses invalid, spent and uncertain
// authority to AUTH_RESTART_REQUIRED. Never infer a sensitive cause from SQL or
// exception text. Unexpected adapter/token-issuer faults stay generic 500.
export function privateEnrollmentFailure(error: unknown): Readonly<{status:number;loginRequired:boolean}> {
  if (error instanceof Error) {
    if (error.message === 'wire') return {status:400,loginRequired:false};
    if (error.message === 'ENROLLMENT_LOGIN_REQUIRED') return {status:409,loginRequired:true};
    if (error.message === 'AUTH_RESTART_REQUIRED') return {status:409,loginRequired:false};
  }
  return {status:500,loginRequired:false};
}
export function rawHeader(request: IncomingMessage, name: string): string | null {
  const found: string[] = [];
  for (let i = 0; i < request.rawHeaders.length; i += 2) {
    if (request.rawHeaders[i]?.toLowerCase() === name) found.push(request.rawHeaders[i + 1] ?? '');
  }
  if (found.length > 1 || found.some(v => !v || /[\r\n]/.test(v) || name !== 'accept-language' && v.includes(','))) throw new Error('wire');
  if (name === 'accept-language' && found[0] && (found[0].length > 255 || !/^[A-Za-z0-9,;.=* -]+$/.test(found[0]))) throw new Error('wire');
  return found[0] ?? null;
}
export function privateCookies(request: IncomingMessage): Readonly<Record<string, string>> {
  const value = rawHeader(request, 'cookie');
  const result: Record<string, string> = Object.create(null) as Record<string, string>;
  if (value === null) return result;
  for (const part of value.split(';')) {
    const trimmed = part.trim(); const i = trimmed.indexOf('=');
    if (i < 1 || /\s/.test(trimmed.slice(0, i)) || !/^[A-Za-z0-9_-]+$/.test(trimmed.slice(0, i)) ||
      !/^[A-Za-z0-9_.-]+$/.test(trimmed.slice(i + 1)) || Object.hasOwn(result, trimmed.slice(0, i))) throw new Error('wire');
    result[trimmed.slice(0, i)] = trimmed.slice(i + 1);
  }
  return result;
}
export function privateWire(request: IncomingMessage): void {
  if (process.env.NODE_ENV !== 'development' || request.socket.remoteAddress !== '127.0.0.1' ||
    !(request.socket instanceof TLSSocket) || !request.socket.encrypted ||
    rawHeader(request, 'host') !== 'localhost:3443' || request.url?.includes('?') ||
    rawHeader(request, 'transfer-encoding') !== null || rawHeader(request, 'content-encoding') !== null ||
    rawHeader(request, 'authorization') !== null || rawHeader(request, 'x-http-method-override') !== null ||
    rawHeader(request, 'forwarded') !== null || rawHeader(request, 'x-forwarded-proto') !== null) throw new Error('wire');
  const size = rawHeader(request, 'content-length');
  if (size === null || !/^(?:[1-9][0-9]{0,3}|0)$/.test(size) || Number(size) > 8192 ||
    rawHeader(request, 'content-type') !== 'application/json') throw new Error('wire');
}
export async function privateBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []; let length = 0;
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk as Uint8Array); length += bytes.length;
    if (length > 8192) throw new Error('wire'); chunks.push(bytes);
  }
  if (length !== Number(rawHeader(request, 'content-length'))) throw new Error('wire');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  // The contract bodies are flat JSON objects whose values are strings or null.
  // Parse tokens in order so duplicate members cannot disappear in JSON.parse.
  let i = 0; const skip = () => { while (i < text.length && /[ \t\r\n]/.test(text[i]!)) i++; };
  const string = (): string => {
    if (text[i] !== '"') throw new Error('wire'); const start = i++;
    while (i < text.length) { if (text[i] === '\\') { i += 2; continue; } if (text[i++] === '"') return JSON.parse(text.slice(start, i)) as string; }
    throw new Error('wire');
  };
  skip(); if (text[i++] !== '{') throw new Error('wire'); skip();
  const value: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  if (text[i] !== '}') while (true) {
    const key = string(); if (Object.hasOwn(value, key)) throw new Error('wire'); skip();
    if (text[i++] !== ':') throw new Error('wire'); skip();
    if (text[i] === '"') value[key] = string();
    else if (text.slice(i, i + 4) === 'null') { value[key] = null; i += 4; }
    else throw new Error('wire');
    skip(); if (text[i] === '}') break; if (text[i++] !== ',') throw new Error('wire'); skip();
  }
  if (text[i++] !== '}') throw new Error('wire'); skip(); if (i !== text.length) throw new Error('wire');
  return value;
}
export function exactBody(body: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(body).length !== keys.length || keys.some(key => !Object.hasOwn(body, key))) throw new Error('wire');
}
type Bootstrap = ReturnType<typeof createDevelopmentBootstrapTransaction>;
export function createPrivateEnrollmentHttp(deps: Readonly<{ bootstrap: () => Bootstrap; enrollment: DurableDevelopmentEnrollment; accessTokens: V2AccessToken }>):
  Readonly<{ handle(request: IncomingMessage, response: ServerResponse): Promise<void> }> {
  return Object.freeze({ async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      privateWire(request);
      const path = request.url;
      let body: Record<string, unknown>;
      try { body = await privateBody(request); } catch { throw new Error('wire'); }
      const origin = rawHeader(request, 'origin');
      if (origin !== ORIGIN) { privateProblem(response, 403); return; }
      const key = rawHeader(request, 'idempotency-key');
      if (!key || !KEY.test(key) || rawHeader(request, 'x-session-csrf') !== null) throw new Error('wire');
      const cookies = privateCookies(request);
      if (Object.keys(cookies).some(name => name !== 'st_v2_binding')) throw new Error('wire');
      if (path === '/v2/auth/browser-nonce' && request.method === 'POST') {
        exactBody(body, ['purpose']);
        if (!['enroll_identifier', 'otp_step_up', 'session'].includes(body.purpose as string)) throw new Error('wire');
        const issued = await deps.bootstrap().issue(key, body.purpose as 'enroll_identifier' | 'otp_step_up' | 'session');
        privateJson(response, 200, { nonce: issued.nonce }, false,
          [`st_v2_binding=${issued.cookieSecret}; Path=/v2; Secure; HttpOnly; SameSite=Lax`]); return;
      }
      if (!canonicalPrivateSecret(cookies.st_v2_binding ?? '')) { privateProblem(response, 403); return; }
      const nonce = rawHeader(request, 'x-browser-nonce');
      if (!nonce || !canonicalPrivateSecret(nonce)) throw new Error('wire');
      const web: EnrollmentWeb = { origin: ORIGIN, bindingCookie: cookies.st_v2_binding!, nonce, chainId: '', epoch: 'st237_private_https_v1' };
      if (path === '/v2/auth/otp/start' && request.method === 'POST') {
        exactBody(body, ['identifier', 'channel', 'purpose', 'transport']);
        if (body.transport !== 'web' || body.purpose !== 'enroll_identifier' ||
          typeof body.identifier !== 'string' || body.identifier.length < 1 || body.identifier.length > 320 ||
          !['email','sms'].includes(body.channel as string)) throw new Error('wire');
        const result = await deps.enrollment.startOtp(web, { identifier: body.identifier as string,
          channel: body.channel as 'email' | 'sms', purpose: 'enroll_identifier' }, key);
        privateJson(response, 202, { challengeId: result.challengeId, status: 'accepted', nextBrowserNonce: result.nextBrowserNonce }); return;
      }
      if (path === '/v2/auth/otp/verify' && request.method === 'POST') {
        exactBody(body, ['challengeId', 'code', 'transport']);
        if (body.transport !== 'web' || typeof body.challengeId !== 'string' || !canonicalPrivateSecret(body.challengeId) ||
          typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) throw new Error('wire');
        const result = await deps.enrollment.verifyOtp(web, { challengeId: body.challengeId as string, code: body.code as string }, key);
        privateJson(response, 200, { purpose: 'enroll_identifier', proof: `v2.${result.proof}`, nextBrowserNonce: result.nextBrowserNonce }); return;
      }
      if (path === '/v2/auth/enrollment/pending' && request.method === 'POST') {
        exactBody(body, ['transport', 'identifierProof']);
        if (body.transport !== 'web' || typeof body.identifierProof !== 'string' || !/^v2\.[A-Za-z0-9_-]{43}$/.test(body.identifierProof)) throw new Error('wire');
        const result = await deps.enrollment.admit(web, { proof: body.identifierProof.slice(3) }, key);
        privateJson(response, 201, { transport: 'web', continuation: `wep.${result.pending}`, status: 'pending', nextBrowserNonce: result.nextBrowserNonce }); return;
      }
      if (path === '/v2/auth/enrollment/simulator/verify' && request.method === 'POST') {
        exactBody(body, ['transport', 'continuation']);
        if (body.transport !== 'web' || typeof body.continuation !== 'string' || !/^wep\.[A-Za-z0-9_-]{43}$/.test(body.continuation)) throw new Error('wire');
        const result = await deps.enrollment.verifyPerson(web, { pending: body.continuation.slice(4) }, key);
        privateJson(response, 200, { transport: 'web', verifiedEnrollment: `wev.${result.verified}`, status: 'verified', nextBrowserNonce: result.nextBrowserNonce }); return;
      }
      if (path === '/v2/auth/enrollment/complete' && request.method === 'POST') {
        exactBody(body, ['transport', 'verifiedEnrollment']);
        if (body.transport !== 'web' || typeof body.verifiedEnrollment !== 'string' || !/^wev\.[A-Za-z0-9_-]{43}$/.test(body.verifiedEnrollment)) throw new Error('wire');
        const result = await deps.enrollment.complete(web, { verified: body.verifiedEnrollment.slice(4) }, key,
          rawHeader(request, 'accept-language') ?? undefined);
        const access = deps.accessTokens.issue(result.identityId, result.sessionId);
        privateJson(response, 201, { transport: 'web', sessionId: result.sessionId, csrfToken: result.csrfToken }, false, [
          `st_v2_access=${access}; Path=/v2; Secure; HttpOnly; SameSite=Lax`,
          `st_v2_refresh=${result.refreshToken}; Path=/v2/auth; Secure; HttpOnly; SameSite=Lax`,
          `st_v2_chain=${result.browserChainId}; Path=/v2; Secure; HttpOnly; SameSite=Lax`,
        ]); return;
      }
      privateProblem(response, 404);
    } catch (error) {
      const failure = privateEnrollmentFailure(error);
      privateProblem(response, failure.status, failure.loginRequired);
    }
  } });
}
