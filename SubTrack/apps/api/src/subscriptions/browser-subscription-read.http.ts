import { types } from 'node:util';
import { TLSSocket } from 'node:tls';
import { Controller, Inject, NotFoundException, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { extractV2BrowserEvidence } from '../auth/http/v2-browser-context.js';
import { hashBrowserBindingCookie } from '../auth/sessions-v2/v2-web-session-binding.js';
import type { V2AccessToken } from '../auth/sessions-v2/v2-access-token.js';
import type { DevelopmentV2PrincipalResolver } from '../auth/sessions-v2/v2-principal-resolver.js';
import type { SessionRepository, SessionRecord, WebSessionContext } from '../auth/sessions-v2/v2-session-issuer.js';
import type { SessionCsrfGuard, VerifiedWebSessionAuthority } from '../auth/session-csrf/session-csrf.js';
import type { SubscriptionReadService } from './subscription-read.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PATH_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const ACCESS = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const HASH = /^[0-9a-f]{64}$/;
const MINOR = /^(0|-?[1-9][0-9]*)$/;
const SESSION_TTL = 86_400_000;
const STATUS = new Set(['DETECTED', 'TRIAL', 'ACTIVE', 'PAUSED', 'CANCELLED', 'ARCHIVED', 'REJECTED']);
const PEER_STATUS = new Set(['TRIAL', 'ACTIVE', 'PAUSED', 'CANCELLED', 'ARCHIVED', 'REJECTED']);
const CADENCE = new Set(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL', 'CUSTOM']);
const CATEGORY = new Set(['VIDEO_STREAMING', 'MUSIC_AUDIO', 'AUDIOBOOKS_EBOOKS', 'NEWS_MAGAZINES', 'GAMING', 'SOFTWARE_PRODUCTIVITY', 'CLOUD_STORAGE', 'AI_TOOLS', 'MOBILE_PLAN', 'BROADBAND_TV', 'FITNESS_WELLNESS', 'FOOD_MEALKITS', 'TRANSPORT_MOBILITY', 'HOME_SECURITY', 'EDUCATION_KIDS', 'PETS', 'SHOPPING_MEMBERSHIPS', 'VPN_SECURITY', 'DONATIONS', 'DATING_SOCIAL', 'APP_STORE_BILLING', 'OTHER_SUBSCRIPTION']);
type Status = 400 | 401 | 403 | 404 | 500;
const PROBLEMS: Record<Status, Readonly<{ type: string; title: string; status: Status; code: string }>> = {
  400: Object.freeze({ type: 'about:blank', title: 'Bad Request', status: 400, code: 'INVALID_SUBSCRIPTION_QUERY' }),
  401: Object.freeze({ type: 'about:blank', title: 'Unauthorized', status: 401, code: 'AUTHENTICATION_REQUIRED' }),
  403: Object.freeze({ type: 'about:blank', title: 'Forbidden', status: 403, code: 'AUTH_CSRF_UNAVAILABLE' }),
  404: Object.freeze({ type: 'about:blank', title: 'Not Found', status: 404, code: 'SUBSCRIPTION_NOT_FOUND' }),
  500: Object.freeze({ type: 'about:blank', title: 'Internal Server Error', status: 500, code: 'INTERNAL_ERROR' }),
};
const fail = (): never => { throw new Error('Browser subscription read unavailable'); };
function data(input: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) return fail();
  const keys = Reflect.ownKeys(input);
  if (keys.some(k => typeof k !== 'string' || (!required.includes(k) && !optional.includes(k))) || required.some(k => !keys.includes(k))) return fail();
  const out = Object.create(null) as Record<string, unknown>;
  for (const key of keys as string[]) {
    const d = Object.getOwnPropertyDescriptor(input, key);
    if (!d || !('value' in d) || !d.enumerable) return fail();
    out[key] = d.value;
  }
  return out;
}
function bound<T>(input: unknown, name: string): T {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail();
  let p: object | null = input;
  while (p) {
    const d = Object.getOwnPropertyDescriptor(p, name);
    if (d) {
      if (!('value' in d) || typeof d.value !== 'function') return fail();
      return Function.prototype.bind.call(d.value, input) as T;
    }
    p = Object.getPrototypeOf(p) as object | null;
  }
  return fail();
}
function raw(request: Request, name: string): string[] {
  if (!Array.isArray(request.rawHeaders)) return fail();
  const values: string[] = [];
  for (let i = 0; i < request.rawHeaders.length; i += 2)
    if (request.rawHeaders[i]?.toLowerCase() === name) values.push(request.rawHeaders[i + 1] ?? '');
  return values;
}
function cookieValues(request: Request, bindingName: string): Readonly<{ access: string | null; binding: string | null }> {
  const headers = raw(request, 'cookie');
  if (headers.length === 0) return Object.freeze({ access: null, binding: null });
  if (headers.length !== 1) return fail();
  const found = Object.create(null) as Record<string, string>;
  for (const section of headers[0]!.split(';')) {
    const part = section.replace(/^[\t ]+/, '');
    const equal = part.indexOf('=');
    const name = part.slice(0, equal);
    if (equal < 1 || !name || name !== name.trim() || /[\t ,]/.test(name) || Object.hasOwn(found, name)) return fail();
    const value = part.slice(equal + 1);
    if (!/^[\x21-\x7e]*$/.test(value) || /[;,"'\\]/.test(value)) return fail();
    found[name] = value;
  }
  if (Object.hasOwn(found, 'st_v2_refresh')) return fail();
  const access = found.st_v2_access;
  const binding = found[bindingName];
  if (binding && (!TOKEN.test(binding) || Buffer.from(binding, 'base64url').toString('base64url') !== binding)) return fail();
  const validAccess = !!access && access.length <= 4096 && ACCESS.test(access) &&
    access.split('.').every(segment => Buffer.from(segment, 'base64url').toString('base64url') === segment);
  return Object.freeze({ access: validAccess ? access : null, binding: binding ?? null });
}
function validNow(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER - SESSION_TTL && Number.isFinite(new Date(n).getTime());
}
function row(value: unknown): Readonly<SessionRecord> {
  const v = data(value, ['identityId', 'sessionId', 'familyId', 'generation', 'refreshTokenHash', 'transport', 'deviceName', 'createdAt', 'expiresAt'], ['exactOrigin', 'browserChainId', 'browserBindingCookieHash']);
  if (typeof v.identityId !== 'string' || !UUID.test(v.identityId) || typeof v.sessionId !== 'string' || !UUID.test(v.sessionId) ||
      typeof v.familyId !== 'string' || !UUID.test(v.familyId) || v.sessionId === v.familyId ||
      v.generation !== 0 || typeof v.refreshTokenHash !== 'string' || !HASH.test(v.refreshTokenHash) ||
      v.transport !== 'web' || v.deviceName !== null || !validNow(v.createdAt) || !validNow(v.expiresAt) ||
      v.expiresAt !== v.createdAt + SESSION_TTL || typeof v.exactOrigin !== 'string' ||
      typeof v.browserChainId !== 'string' || !v.browserChainId || typeof v.browserBindingCookieHash !== 'string' || !HASH.test(v.browserBindingCookieHash)) return fail();
  return Object.freeze({ ...v }) as unknown as Readonly<SessionRecord>;
}
function web(value: unknown): Readonly<WebSessionContext> {
  const v = data(value, ['transport', 'exactOrigin', 'browserChainId']);
  if (v.transport !== 'web' || typeof v.exactOrigin !== 'string' || typeof v.browserChainId !== 'string' || !v.browserChainId) return fail();
  return Object.freeze({ ...v }) as unknown as Readonly<WebSessionContext>;
}
function canonicalOutput(value: unknown): Record<string, unknown> {
  const common = ['visibility', 'id', 'categoryCode', 'cadence', 'status', 'expectedAmountMinor', 'currency'];
  const v = data(value, common, ['customName', 'merchantId', 'merchantName', 'nextChargeDate', 'alwaysPrivate']);
  if (v.visibility !== 'owner' && v.visibility !== 'household') return fail();
  const owner = v.visibility === 'owner';
  if (owner && !['customName', 'merchantId', 'merchantName', 'nextChargeDate', 'alwaysPrivate'].every(k => Object.hasOwn(v, k))) return fail();
  if (!owner && Object.keys(v).length !== common.length) return fail();
  if (typeof v.id !== 'string' || !UUID.test(v.id) || typeof v.categoryCode !== 'string' || !CATEGORY.has(v.categoryCode) ||
      typeof v.cadence !== 'string' || !CADENCE.has(v.cadence) || typeof v.status !== 'string' || !(owner ? STATUS : PEER_STATUS).has(v.status) ||
      typeof v.currency !== 'string' || !/^[A-Z]{3}$/.test(v.currency) || typeof v.expectedAmountMinor !== 'string' || !MINOR.test(v.expectedAmountMinor) ||
      BigInt(v.expectedAmountMinor) < -(1n << 63n) || BigInt(v.expectedAmountMinor) > (1n << 63n) - 1n) return fail();
  if (owner) {
    if (typeof v.alwaysPrivate !== 'boolean' ||
        (v.customName !== null && (typeof v.customName !== 'string' || [...v.customName].length > 256)) ||
        (v.merchantName !== null && (typeof v.merchantName !== 'string' || [...v.merchantName].length > 256)) ||
        (v.merchantId !== null && (typeof v.merchantId !== 'string' || !UUID.test(v.merchantId))) ||
        (v.nextChargeDate !== null && (typeof v.nextChargeDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.nextChargeDate) ||
          !Number.isFinite(Date.parse(`${v.nextChargeDate}T00:00:00.000Z`)) ||
          new Date(`${v.nextChargeDate}T00:00:00.000Z`).toISOString().slice(0, 10) !== v.nextChargeDate))) return fail();
  }
  return Object.freeze({ ...v });
}
export type BrowserSubscriptionReadHttpConfig = Readonly<{
  environment: 'development'; enabled: true; allowedOrigins: readonly string[]; bindingCookieName: string;
  accessTokens: Pick<V2AccessToken, 'verify'>; principal: Pick<DevelopmentV2PrincipalResolver, 'resolve'>;
  repository: Required<Pick<SessionRepository, 'readSession' | 'webContextForCurrentSession'>>;
  csrf: Pick<SessionCsrfGuard, 'verify'>; subscriptions: Pick<SubscriptionReadService, 'detail'>; clock: () => number;
}>;

/** Private, explicit composition only. This controller is absent from the default application graph. */
export class BrowserSubscriptionReadHttpService {
  private readonly origins: readonly string[];
  private readonly bindingName: string;
  private readonly clock: () => number;
  private readonly verify: V2AccessToken['verify'];
  private readonly resolve: DevelopmentV2PrincipalResolver['resolve'];
  private readonly read: SessionRepository['readSession'];
  private readonly webContext: NonNullable<SessionRepository['webContextForCurrentSession']>;
  private readonly csrf: SessionCsrfGuard['verify'];
  private readonly detail: SubscriptionReadService['detail'];
  constructor(input: BrowserSubscriptionReadHttpConfig) {
    const c = data(input, ['environment', 'enabled', 'allowedOrigins', 'bindingCookieName', 'accessTokens', 'principal', 'repository', 'csrf', 'subscriptions', 'clock']);
    if (c.environment !== 'development' || c.enabled !== true || !Array.isArray(c.allowedOrigins) || !c.allowedOrigins.length ||
        typeof c.bindingCookieName !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(c.bindingCookieName) ||
        ['st_v2_access', 'st_v2_refresh'].includes(c.bindingCookieName) || typeof c.clock !== 'function') fail();
    const allowed = c.allowedOrigins as readonly string[];
    const origins: string[] = [];
    for (let i = 0; i < allowed.length; i++) {
      const d = Object.getOwnPropertyDescriptor(allowed, String(i));
      const origin = d && 'value' in d ? d.value : undefined;
      if (typeof origin !== 'string') fail();
      let url: URL | undefined;
      try { url = new URL(origin); } catch { fail(); }
      if (!url || url.protocol !== 'https:' || url.origin !== origin || url.username || url.password || url.hostname.includes('*') || url.pathname !== '/' || url.search || url.hash || origins.includes(origin)) fail();
      origins.push(origin);
    }
    if (Reflect.ownKeys(allowed).length !== origins.length + 1) fail();
    this.origins = Object.freeze(origins);
    this.bindingName = c.bindingCookieName as string;
    this.clock = c.clock as () => number;
    this.verify = bound(c.accessTokens, 'verify');
    this.resolve = bound(c.principal, 'resolve');
    this.read = bound(c.repository, 'readSession');
    this.webContext = bound(c.repository, 'webContextForCurrentSession');
    this.csrf = bound(c.csrf, 'verify');
    this.detail = bound(c.subscriptions, 'detail');
  }
  async handle(id: unknown, request: Request, response: Response): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    const send = (status: Status): void => { if (!response.headersSent) response.status(status).type('application/problem+json').json(PROBLEMS[status]); };
    let stage: 'request' | 'authority' | 'csrf' | 'detail' = 'request';
    try {
      const url = request.originalUrl;
      const body = (request as Request & { rawBody?: unknown }).rawBody;
      const lengths = raw(request, 'content-length');
      const csrfHeaders = raw(request, 'x-session-csrf');
      if (typeof id !== 'string' || !PATH_UUID.test(id) || typeof url !== 'string' || url !== `/v2/subscriptions/${id}/read` ||
          request.method !== 'POST' || raw(request, 'content-type').length !== 1 || raw(request, 'content-type')[0] !== 'application/json' ||
          lengths.length !== 1 || !/^(?:[1-9]|[1-5][0-9]|6[0-4])$/.test(lengths[0]!) ||
          raw(request, 'transfer-encoding').length !== 0 || raw(request, 'authorization').length !== 0 ||
          raw(request, 'idempotency-key').length !== 0 || raw(request, 'x-browser-nonce').length !== 0 ||
          ['x-user-id', 'x-identity-id', 'x-owner-id', 'x-household-id', 'x-session-id', 'x-scope', 'x-transport']
            .some(name => raw(request, name).length !== 0) ||
          raw(request, 'x-csrf-token').length !== 0 || raw(request, 'csrf-token').length !== 0 || raw(request, 'x-xsrf-token').length !== 0 ||
          csrfHeaders.length > 1 ||
          !Buffer.isBuffer(body) || body.length !== Number(lengths[0]) || !/^[ \t\r\n]*\{[ \t\r\n]*\}[ \t\r\n]*$/.test(body.toString('utf8')) ||
          Object.keys(data(request.body, [])).length !== 0) return send(400);
      if (csrfHeaders.length !== 1 || !TOKEN.test(csrfHeaders[0]!) ||
          Buffer.from(csrfHeaders[0]!, 'base64url').toString('base64url') !== csrfHeaders[0]) return send(403);
      const cookies = cookieValues(request, this.bindingName);
      if (!cookies.access || !cookies.binding) return send(401);
      const evidence = extractV2BrowserEvidence(request, { allowedOrigins: this.origins, bindingCookieName: this.bindingName, allowLoopbackHttpDevelopment: false });
      if (!(request.socket instanceof TLSSocket) || !evidence.isHttps || !evidence.origin || evidence.bindingCookie !== cookies.binding) return send(400);
      stage = 'authority';
      let claimsValue: unknown;
      try { claimsValue = this.verify(cookies.access); } catch { return send(401); }
      const claims = data(claimsValue, ['iss', 'aud', 'sub', 'sid', 'iat', 'exp', 'ver']);
      if (claims.iss !== 'urn:subtrack:auth:v2:development' || claims.aud !== 'urn:subtrack:api:v2:development' || claims.ver !== 2 ||
          typeof claims.sub !== 'string' || !UUID.test(claims.sub) || typeof claims.sid !== 'string' || !UUID.test(claims.sid) ||
          !Number.isSafeInteger(claims.iat) || (claims.iat as number) < 0 || !Number.isSafeInteger(claims.exp) || claims.exp !== (claims.iat as number) + 900) return send(401);
      const before = this.clock();
      if (!validNow(before)) return send(500);
      if ((claims.iat as number) > Math.floor(before / 1000) || Math.floor(before / 1000) >= (claims.exp as number)) return send(401);
      const owner = Object.freeze({ userId: claims.sub });
      const hash = hashBrowserBindingCookie(cookies.binding);
      const initialValue = this.read(claims.sid, owner, before);
      if (initialValue === null) return send(401);
      const initial = row(initialValue);
      const chainValue = this.webContext(claims.sid, owner, hash, evidence.origin, before);
      if (chainValue === null) return send(401);
      const chain = web(chainValue);
      if (initial.identityId !== claims.sub || initial.sessionId !== claims.sid || initial.createdAt > before || before >= initial.expiresAt ||
          initial.browserBindingCookieHash !== hash || initial.exactOrigin !== evidence.origin || chain.exactOrigin !== evidence.origin || chain.browserChainId !== initial.browserChainId) return send(401);
      const pending = this.resolve(cookies.access, Object.freeze({ transport: 'web', exactOrigin: evidence.origin, browserChainId: chain.browserChainId }));
      if (!types.isPromise(pending) || Object.getPrototypeOf(pending) !== Promise.prototype || Reflect.ownKeys(pending).length) return send(500);
      let principalValue: unknown;
      try { principalValue = await pending; } catch { return send(401); }
      const principal = data(principalValue, ['identityId', 'sessionId']);
      if (principal.identityId !== claims.sub || principal.sessionId !== claims.sid) return send(401);
      const now = this.clock();
      if (!validNow(now) || now < before || Math.floor(now / 1000) >= (claims.exp as number)) return send(401);
      const currentValue = this.read(claims.sid, owner, now);
      if (currentValue === null) return send(401);
      const current = row(currentValue);
      const currentChainValue = this.webContext(claims.sid, owner, hash, evidence.origin, now);
      if (currentChainValue === null) return send(401);
      const currentChain = web(currentChainValue);
      if (current.identityId !== claims.sub || current.sessionId !== claims.sid || current.createdAt > now || now >= current.expiresAt ||
          current.familyId !== initial.familyId || current.refreshTokenHash !== initial.refreshTokenHash || current.createdAt !== initial.createdAt || current.expiresAt !== initial.expiresAt ||
          current.browserBindingCookieHash !== hash || current.exactOrigin !== evidence.origin || current.browserChainId !== chain.browserChainId ||
          currentChain.exactOrigin !== evidence.origin || currentChain.browserChainId !== chain.browserChainId) return send(401);
      stage = 'csrf';
      const authority = Object.freeze({ identityId: claims.sub, sessionId: claims.sid }) as VerifiedWebSessionAuthority;
      try { if (this.csrf(authority, csrfHeaders[0]!) !== undefined) return send(500); } catch { return send(403); }
      stage = 'detail';
      const result = await this.detail(Object.freeze({ userId: claims.sub }), id.toLowerCase());
      const output = canonicalOutput(result);
      if (output.id !== id.toLowerCase()) return send(500);
      if (!response.headersSent) response.status(200).type('application/json').json(output);
    } catch (error) {
      if (stage === 'request') return send(400);
      if (stage === 'detail' && error instanceof NotFoundException) return send(404);
      send(500);
    }
  }
}

@Controller('v2/subscriptions')
export class BrowserSubscriptionReadHttpController {
  constructor(@Inject(BrowserSubscriptionReadHttpService) private readonly service: BrowserSubscriptionReadHttpService) {}
  @Post(':id/read') read(@Param('id') id: string, @Req() request: Request, @Res() response: Response): Promise<void> {
    return this.service.handle(id, request, response);
  }
}
