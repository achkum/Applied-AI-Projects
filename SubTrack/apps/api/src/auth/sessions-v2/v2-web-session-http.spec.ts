import { createHash, generateKeyPairSync } from 'node:crypto';
import { TLSSocket } from 'node:tls';
import { Socket } from 'node:net';
import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BankIdSimulator } from '../identity-provider/bankid-simulator';
import {
  BrowserNonceGuard,
  InMemoryBrowserNonceStore,
} from '../browser-nonce/browser-nonce';
import { DevelopmentSimulatorLoginProofProducer } from '../proofs-v2/bankid-simulator-proof-producer';
import { ProofStore, InMemoryProofRepository } from '../proofs-v2/proof-store';
import { InMemoryIdempotencyGuard } from '../idempotency/idempotency-guard';
import {
  SessionCsrfGuard,
  InMemorySessionCsrfStore,
  type VerifiedWebSessionAuthority,
} from '../session-csrf/session-csrf';
import {
  DevelopmentV2SessionIssuer,
  InMemoryV2SessionRepository,
  type SessionResponse,
} from './v2-session-issuer';
import { DevelopmentV2PrincipalResolver } from './v2-principal-resolver';
import { V2AccessToken } from './v2-access-token';
import { hashBrowserBindingCookie } from './v2-web-session-binding';
import {
  V2WebSessionHttpService,
  type V2WebSessionHttpConfig,
} from './v2-web-session-http';
import { V2WebSessionHttpModule } from './v2-web-session-http.module';

const NOW = 1_800_000_000_000;
const ORIGIN = 'https://app.example';
const ID = '123e4567-e89b-42d3-a456-426614174000';
const OTHER = '123e4567-e89b-42d3-a456-426614174001';
const KEY = 'session-fixture-key-0001';
const sockets: TLSSocket[] = [];
const hashRefresh = (token: string) =>
  createHash('sha256')
    .update('subtrack:auth-refresh:v2:', 'utf8')
    .update(token, 'utf8')
    .digest('hex');
beforeEach(() => {
  vi.spyOn(BankIdSimulator.prototype, 'verify').mockResolvedValue({
    method: 'BANKID',
    name: 'Fictional Fixture',
    personnummerHmac: 'a'.repeat(64),
    verifiedAt: new Date(NOW).toISOString(),
  });
});
afterEach(() => {
  for (const socket of sockets.splice(0)) socket.destroy();
  vi.restoreAllMocks();
});
function responseFixture() {
  const headers = new Map<string, unknown>();
  const response = {
    headersSent: false,
    statusCode: 0,
    payload: undefined as unknown,
    setHeader: vi.fn((name: string, value: unknown) => {
      headers.set(name.toLowerCase(), value);
    }),
    removeHeader: vi.fn((name: string) => {
      headers.delete(name.toLowerCase());
    }),
    status: vi.fn((status: number) => {
      response.statusCode = status;
      return response;
    }),
    type: vi.fn(() => response),
    send: vi.fn((payload: unknown) => {
      response.payload = payload;
      response.headersSent = true;
      return response;
    }),
  };
  return { response, headers, port: response as unknown as Response };
}
async function fixture() {
  let now = NOW;
  const clock = () => now;
  const nonceStore = new InMemoryBrowserNonceStore();
  const nonce = new BrowserNonceGuard(
    { allowedOrigins: [ORIGIN], clock },
    nonceStore,
  );
  const evidence = {
    origin: ORIGIN,
    isHttps: true,
    explicitLoopbackDevelopment: false,
  };
  const bootstrap = nonce.issue('session', evidence);
  const trusted = nonce.validateBound(
    'session',
    evidence,
    bootstrap.nonce,
    bootstrap.cookieSecret,
  );
  const context = Object.freeze({
    transport: 'web' as const,
    exactOrigin: ORIGIN,
    browserChainId: trusted.chainId,
  });
  const proofs = new ProofStore(new InMemoryProofRepository(), clock);
  const producer = new DevelopmentSimulatorLoginProofProducer({
    environment: 'development',
    enabled: true,
    simulatorHmacKey: new Uint8Array(32).fill(9),
    identityResolver: { resolveRegisteredIdentityId: () => ID },
    proofStore: proofs,
    clock,
  });
  const proof = await producer.issue(context);
  const keys = generateKeyPairSync('ed25519');
  const tokens = new V2AccessToken({
    environment: 'development',
    enabled: true,
    privateKey: keys.privateKey,
    publicKey: keys.publicKey,
    clock,
  });
  const repo = new InMemoryV2SessionRepository([ID, OTHER], 100, clock);
  const issuer = new DevelopmentV2SessionIssuer({
    environment: 'development',
    enabled: true,
    proofStore: proofs,
    accessTokens: tokens,
    repository: repo,
    clock,
  });
  const principal = new DevelopmentV2PrincipalResolver({
    environment: 'development',
    enabled: true,
    accessTokens: tokens,
    reader: repo,
    clock,
  });
  const csrfStore = new InMemorySessionCsrfStore();
  const csrf = new SessionCsrfGuard(csrfStore);
  const idempotency = new InMemoryIdempotencyGuard({
    key: new Uint8Array(32).fill(8),
    ttlMs: 86_400_000,
    clock,
  });
  let issued: Readonly<SessionResponse> | undefined;
  const issue = vi.fn(
    async (input: Parameters<typeof issuer.issueFromLoginProof>[0]) => {
      issued = await issuer.issueFromLoginProof(input);
      return issued;
    },
  );
  const c: {
    -readonly [K in keyof V2WebSessionHttpConfig]: V2WebSessionHttpConfig[K];
  } = {
    environment: 'development',
    enabled: true,
    allowedOrigins: [ORIGIN],
    bindingCookieName: 'st_v2_browser',
    authorityHmacKey: new Uint8Array(32).fill(7),
    nonce,
    issuer: { issueFromLoginProof: issue },
    principal,
    repository: repo,
    csrf,
    idempotency,
    clock,
  };
  const socket = new TLSSocket(new Socket());
  sockets.push(socket);
  const request = {
    originalUrl: '/v2/auth/session',
    rawHeaders: [
      'Origin',
      ORIGIN,
      'Cookie',
      `st_v2_browser=${bootstrap.cookieSecret}`,
      'Idempotency-Key',
      KEY,
      'X-Browser-Nonce',
      bootstrap.nonce,
    ],
    socket,
  } as unknown as Request;
  const body = { transport: 'web', loginProof: proof };
  const run = async (r = responseFixture(), input: unknown = body) => {
    await new V2WebSessionHttpService(c).handle(
      input,
      KEY,
      bootstrap.nonce,
      request,
      r.port,
    );
    return r;
  };
  return {
    c,
    clock,
    setNow: (value: number) => {
      now = value;
    },
    nonce,
    nonceStore,
    bootstrap,
    proofs,
    proof,
    context,
    tokens,
    repo,
    issuer,
    principal,
    csrf,
    csrfStore,
    idempotency,
    issue,
    issued: () => issued,
    request,
    body,
    run,
  };
}
function rowFor(f: Awaited<ReturnType<typeof fixture>>) {
  const issued = f.issued();
  if (!issued) throw new Error('Fixture issuance absent');
  return f.repo.readSession(issued.sessionId, { userId: ID }, f.clock());
}

describe('development web session exchange trust boundaries', () => {
  it('uses the real shared pipeline, verifies owner/CSRF, consumes nonce and never exposes credentials in JSON', async () => {
    const f = await fixture();
    const r = await f.run();
    expect(r.response.statusCode).toBe(201);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('pragma')).toBe('no-cache');
    const issued = f.issued()!;
    const payload = r.response.payload as {
      transport: string;
      sessionId: string;
      csrfToken: string;
    };
    expect(Object.keys(payload).sort()).toEqual([
      'csrfToken',
      'sessionId',
      'transport',
    ]);
    expect(Object.isFrozen(payload)).toBe(true);
    expect(payload.transport).toBe('web');
    expect(payload.sessionId === issued.sessionId).toBe(true);
    expect(
      JSON.stringify(payload).includes(issued.accessToken) ||
        JSON.stringify(payload).includes(issued.refreshToken) ||
        JSON.stringify(payload).includes(f.bootstrap.cookieSecret),
    ).toBe(false);
    expect(
      (await f.principal.resolve(issued.accessToken, f.context)).identityId,
    ).toBe(ID);
    const authority = {
      identityId: ID,
      sessionId: issued.sessionId,
    } as VerifiedWebSessionAuthority;
    expect(() => f.csrf.verify(authority, payload.csrfToken)).not.toThrow();
    expect(
      rowFor(f)?.refreshTokenHash === hashRefresh(issued.refreshToken),
    ).toBe(true);
    expect(
      rowFor(f)?.browserBindingCookieHash ===
        hashBrowserBindingCookie(f.bootstrap.cookieSecret),
    ).toBe(true);
    expect(f.nonceStore.snapshot()).toHaveLength(0);
    const cookies = r.headers.get('set-cookie') as readonly string[];
    expect(cookies).toHaveLength(2);
    expect(
      cookies[0]?.endsWith('; Path=/v2; Secure; HttpOnly; SameSite=Lax'),
    ).toBe(true);
    expect(
      cookies[1]?.endsWith('; Path=/v2/auth; Secure; HttpOnly; SameSite=Lax'),
    ).toBe(true);
    expect(
      cookies.every((cookie) => !/Domain=|Max-Age=|Expires=/.test(cookie)),
    ).toBe(true);
  });
  it('races one nonce and produces exactly one credential response, with no replay result', async () => {
    const f = await fixture();
    const service = new V2WebSessionHttpService(f.c);
    const a = responseFixture(),
      b = responseFixture();
    await Promise.all([
      service.handle(f.body, KEY, f.bootstrap.nonce, f.request, a.port),
      service.handle(f.body, KEY, f.bootstrap.nonce, f.request, b.port),
    ]);
    expect([a.response.statusCode, b.response.statusCode].sort()).toEqual([
      201, 409,
    ]);
    expect(f.issue).toHaveBeenCalledTimes(1);
    const denied = a.response.statusCode === 409 ? a : b;
    expect(denied.headers.has('set-cookie')).toBe(false);
  });
  it.each([
    'extra',
    'symbol',
    'hidden',
    'getter',
    'mobile',
    'array',
    'inherited',
  ] as const)(
    'rejects %s body without invoking identity or nonce mutations',
    async (kind) => {
      const f = await fixture();
      const getter = vi.fn(() => 'web');
      let body: unknown = { ...f.body };
      if (kind === 'extra') body = { ...f.body, identityId: OTHER };
      if (kind === 'symbol') body = { ...f.body, [Symbol('foreign')]: true };
      if (kind === 'hidden')
        body = Object.defineProperty({ ...f.body }, 'foreign', { value: true });
      if (kind === 'getter')
        body = Object.defineProperty({ ...f.body }, 'transport', {
          enumerable: true,
          get: getter,
        });
      if (kind === 'mobile') body = { ...f.body, transport: 'mobile' };
      if (kind === 'array') body = [f.body];
      if (kind === 'inherited')
        body = Object.assign(
          Object.create({ foreign: true }) as object,
          f.body,
        );
      const r = await f.run(undefined, body);
      expect(r.response.statusCode).toBe(400);
      expect(getter).not.toHaveBeenCalled();
      expect(f.issue).not.toHaveBeenCalled();
      expect(f.nonceStore.snapshot()).toHaveLength(1);
      expect((await f.proofs.consumeLogin(f.proof, f.context)).valid).toBe(
        true,
      );
    },
  );
  it.each([
    'Authorization',
    'X-Session-CSRF',
    'X-CSRF-Token',
    'Origin',
    'Idempotency-Key',
    'X-Browser-Nonce',
    'Cookie',
    'query',
    'plain-http',
  ] as const)(
    'rejects malformed or mixed %s requests before mutations',
    async (kind) => {
      const f = await fixture();
      if (kind === 'query') f.request.originalUrl += '?foreign=1';
      else if (kind === 'plain-http')
        Object.defineProperty(f.request, 'socket', { value: new Socket() });
      else
        f.request.rawHeaders.push(
          kind,
          kind === 'Origin'
            ? ORIGIN
            : kind === 'Cookie'
              ? `st_v2_browser=${f.bootstrap.cookieSecret}`
              : 'foreign',
        );
      const r = await f.run();
      expect(r.response.statusCode).toBe(400);
      expect(f.issue).not.toHaveBeenCalled();
      expect(f.nonceStore.snapshot()).toHaveLength(1);
    },
  );
  it.each(['foreign-chain', 'mobile'] as const)(
    'burns nonce but leaves a nonmatching %s proof redeemable in its original scope',
    async (kind) => {
      const f = await fixture();
      const original =
        kind === 'mobile'
          ? { transport: 'mobile' as const }
          : { ...f.context, browserChainId: 'foreign-chain' };
      const proof = await f.proofs.issue({
        purpose: 'login',
        challenge: 'server-fixture',
        identityId: ID,
        ...original,
      });
      const r = await f.run(undefined, { transport: 'web', loginProof: proof });
      expect(r.response.statusCode).toBe(401);
      expect(f.nonceStore.snapshot()).toHaveLength(0);
      expect((await f.proofs.consumeLogin(proof, original)).valid).toBe(true);
      expect(r.headers.has('set-cookie')).toBe(false);
    },
  );
  it('does not consume a step-up proof through the login exchange', async () => {
    const f = await fixture();
    const binding = {
      purpose: 'stepup' as const,
      challenge: 'server-fixture',
      identifierHash: 'a'.repeat(64),
      identityId: ID,
      ...f.context,
    };
    const proof = await f.proofs.issue(binding);
    const r = await f.run(undefined, { transport: 'web', loginProof: proof });
    expect(r.response.statusCode).toBe(401);
    expect((await f.proofs.consume(proof, binding)).valid).toBe(true);
  });
  it.each(['csrf', 'settle', 'header', 'send'] as const)(
    'cleans only known issuance after %s failure before delivery',
    async (fault) => {
      const f = await fixture();
      const r = responseFixture();
      const rollback = vi.spyOn(f.repo, 'rollbackCreatedSession');
      if (fault === 'csrf')
        vi.spyOn(f.csrf, 'mint').mockImplementation(() => {
          throw new Error('fixture');
        });
      if (fault === 'settle')
        vi.spyOn(f.idempotency, 'settle').mockImplementation(() => {
          throw new Error('fixture');
        });
      if (fault === 'header')
        r.response.setHeader.mockImplementation((name, value) => {
          r.headers.set(name.toLowerCase(), value);
          if (name === 'Set-Cookie') throw new Error('fixture');
        });
      if (fault === 'send')
        r.response.send.mockImplementationOnce(() => {
          throw new Error('fixture');
        });
      await f.run(r);
      expect(r.response.statusCode).toBe(500);
      expect(r.headers.has('set-cookie')).toBe(false);
      expect(rollback).toHaveBeenCalledTimes(1);
      expect(rowFor(f)).toBeNull();
      expect(f.csrfStore.snapshot()).toHaveLength(0);
      expect((await f.proofs.consumeLogin(f.proof, f.context)).valid).toBe(
        false,
      );
      expect(f.nonceStore.snapshot()).toHaveLength(0);
    },
  );
  it('refuses to remove a refresh-advanced row during failure cleanup', async () => {
    const f = await fixture();
    const successor = 'b'.repeat(64);
    vi.spyOn(f.csrf, 'mint').mockImplementation(() => {
      const issued = f.issued()!;
      expect(
        f.repo.rotateRefresh({
          refreshTokenHash: hashRefresh(issued.refreshToken),
          successorRefreshTokenHash: successor,
          transportContext: f.context,
          observedAt: f.clock(),
        }).kind,
      ).toBe('rotated');
      throw new Error('fixture');
    });
    const r = await f.run();
    expect(r.response.statusCode).toBe(500);
    expect(rowFor(f)?.refreshTokenHash === successor).toBe(true);
    expect(r.headers.has('set-cookie')).toBe(false);
  });
  it('does not undo session/CSRF state after response headers have been sent', async () => {
    const f = await fixture();
    const r = responseFixture();
    const rollback = vi.spyOn(f.repo, 'rollbackCreatedSession');
    r.response.send.mockImplementationOnce(() => {
      r.response.headersSent = true;
      throw new Error('fixture');
    });
    await f.run(r);
    expect(rollback).not.toHaveBeenCalled();
    expect(rowFor(f)).not.toBeNull();
    expect(f.csrfStore.snapshot()).toHaveLength(1);
    expect(r.response.send).toHaveBeenCalledTimes(1);
  });
  it('denies owner deletion during principal resolution and does not guess cleanup authority', async () => {
    const f = await fixture();
    f.c.principal = {
      resolve: async (token, context) => {
        const value = await f.principal.resolve(token, context);
        f.repo.markIdentityDeleted(ID, { userId: ID });
        return value;
      },
    };
    const rollback = vi.spyOn(f.repo, 'rollbackCreatedSession');
    const r = await f.run();
    expect(r.response.statusCode).toBe(500);
    expect(rollback).not.toHaveBeenCalled();
    expect(r.headers.has('set-cookie')).toBe(false);
  });
  it('rejects accessor-backed fulfilled issuer output without invoking the getter or guessing rollback', async () => {
    const f = await fixture();
    const getter = vi.fn(() => 'foreign');
    const rollback = vi.spyOn(f.repo, 'rollbackCreatedSession');
    f.c.issuer = {
      issueFromLoginProof: vi.fn(async (input) => {
        const issued = await f.issuer.issueFromLoginProof(input);
        return Object.defineProperty({ ...issued }, 'sessionId', {
          enumerable: true,
          get: getter,
        });
      }),
    };
    const r = await f.run();
    expect(r.response.statusCode).toBe(500);
    expect(getter).not.toHaveBeenCalled();
    expect(rollback).not.toHaveBeenCalled();
    expect(r.headers.has('set-cookie')).toBe(false);
  });
  it.each(['then', 'constructor'] as const)(
    'does not invoke hostile %s getters on issuer promises',
    async (key) => {
      const f = await fixture();
      const getter = vi.fn(() => Promise);
      const promise = Promise.resolve({});
      Object.defineProperty(promise, key, { get: getter });
      f.c.issuer = { issueFromLoginProof: () => promise as never };
      const r = await f.run();
      expect(r.response.statusCode).toBe(500);
      expect(getter).not.toHaveBeenCalled();
      expect(r.headers.has('set-cookie')).toBe(false);
    },
  );
  it.each([
    'production',
    'http',
    'cookie-collision',
    'key',
    'clock',
    'getter',
  ] as const)(
    'rejects %s config at both service and registration boundaries',
    async (kind) => {
      const f = await fixture();
      const bad: Record<string, unknown> = { ...f.c };
      const getter = vi.fn(() => true);
      if (kind === 'production') bad.environment = 'production';
      if (kind === 'http') bad.allowedOrigins = ['http://localhost'];
      if (kind === 'cookie-collision') bad.bindingCookieName = 'st_v2_access';
      if (kind === 'key') bad.authorityHmacKey = new Uint8Array(31);
      if (kind === 'clock') bad.clock = null;
      if (kind === 'getter')
        Object.defineProperty(bad, 'enabled', {
          enumerable: true,
          get: getter,
        });
      expect(() => new V2WebSessionHttpService(bad as never)).toThrow();
      expect(() => V2WebSessionHttpModule.register(bad as never)).toThrow();
      expect(getter).not.toHaveBeenCalled();
    },
  );
  it('rejects origin-array getters without evaluating them at either boundary', async () => {
    const f = await fixture();
    const getter = vi.fn(() => ORIGIN);
    const origins = Object.defineProperty([ORIGIN], '0', {
      enumerable: true,
      get: getter,
    });
    const c = { ...f.c, allowedOrigins: origins };
    expect(() => new V2WebSessionHttpService(c)).toThrow();
    expect(() => V2WebSessionHttpModule.register(c)).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it('captures the trusted receiver and copies configuration before callers can replace it', async () => {
    const f = await fixture();
    const service = new V2WebSessionHttpService(f.c);
    f.c.issuer = {
      issueFromLoginProof: async () => {
        throw new Error('replacement');
      },
    };
    (f.c.authorityHmacKey as Uint8Array).fill(0);
    const r = responseFixture();
    await service.handle(f.body, KEY, f.bootstrap.nonce, f.request, r.port);
    expect(r.response.statusCode).toBe(201);
    expect(f.issue).toHaveBeenCalledTimes(1);
  });
  it.each([
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER,
    8_640_000_000_000_001,
  ])(
    'fails closed on invalid trusted clock %s without credential publication',
    async (clock) => {
      const f = await fixture();
      f.setNow(clock);
      const r = await f.run();
      expect(r.response.statusCode === 201).toBe(false);
      expect(r.headers.has('set-cookie')).toBe(false);
      expect(f.issue).not.toHaveBeenCalled();
    },
  );
  it('rejects a clock regression across proof issuance without guessing commit cleanup', async () => {
    const f = await fixture();
    const rollback = vi.spyOn(f.repo, 'rollbackCreatedSession');
    f.c.issuer = {
      issueFromLoginProof: async (input) => {
        const value = await f.issuer.issueFromLoginProof(input);
        f.setNow(NOW - 1);
        return value;
      },
    };
    const r = await f.run();
    expect(r.response.statusCode).toBe(500);
    expect(r.headers.has('set-cookie')).toBe(false);
    expect(rollback).not.toHaveBeenCalled();
  });
});
