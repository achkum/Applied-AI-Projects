import { generateKeyPairSync } from 'node:crypto';
import { TLSSocket } from 'node:tls';
import { Socket } from 'node:net';
import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BankIdSimulator } from '../identity-provider/bankid-simulator';
import {
  BrowserNonceGuard,
  InMemoryBrowserNonceStore,
} from '../browser-nonce/browser-nonce';
import { DevelopmentSimulatorLoginProofProducer } from '../proofs-v2/bankid-simulator-proof-producer';
import { InMemoryProofRepository, ProofStore } from '../proofs-v2/proof-store';
import { InMemoryIdempotencyGuard } from '../idempotency/idempotency-guard';
import {
  InMemorySessionCsrfStore,
  SessionCsrfGuard,
  type VerifiedWebSessionAuthority,
} from '../session-csrf/session-csrf';
import { DevelopmentV2PrincipalResolver } from './v2-principal-resolver';
import {
  DevelopmentV2SessionIssuer,
  InMemoryV2SessionRepository,
  type SessionResponse,
} from './v2-session-issuer';
import { V2AccessToken } from './v2-access-token';
import { V2WebSessionHttpService } from './v2-web-session-http';
import { V2WebRevocationHttpModule } from './v2-web-revocation-http.module';
import { hashBrowserBindingCookie } from './v2-web-session-binding';
import {
  V2WebRevocationHttpService,
  type V2WebRevocationHttpConfig,
} from './v2-web-revocation-http';

const NOW = 1_800_000_000_000;
const ORIGIN = 'https://app.example';
const ID = '123e4567-e89b-42d3-a456-426614174000';
const OTHER = '123e4567-e89b-42d3-a456-426614174001';
const sockets: TLSSocket[] = [];
const originalVerify = BankIdSimulator.prototype.verify;

function responseFixture() {
  const headers = new Map<string, unknown>();
  const response = {
    headersSent: false,
    statusCode: 0,
    payload: undefined as unknown,
    setHeader: vi.fn((name: string, value: unknown) =>
      headers.set(name.toLowerCase(), value),
    ),
    status: vi.fn((status: number) => {
      response.statusCode = status;
      return response;
    }),
    type: vi.fn(() => response),
    end: vi.fn(() => {
      response.headersSent = true;
      return response;
    }),
    send: vi.fn((payload: unknown) => {
      response.payload = payload;
      response.headersSent = true;
      return response;
    }),
  };
  return { response, headers, port: response as unknown as Response };
}

async function fixture(maxConsumed = 100) {
  let now = NOW;
  const clock = () => now;
  vi.spyOn(BankIdSimulator.prototype, 'verify').mockResolvedValue({
    method: 'BANKID',
    name: 'Fictional Fixture',
    personnummerHmac: 'a'.repeat(64),
    verifiedAt: new Date(NOW).toISOString(),
  });
  const nonce = new BrowserNonceGuard(
    { allowedOrigins: [ORIGIN], clock },
    new InMemoryBrowserNonceStore(),
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
  const web = Object.freeze({
    transport: 'web' as const,
    exactOrigin: ORIGIN,
    browserChainId: trusted.chainId,
  });
  const proofs = new ProofStore(new InMemoryProofRepository(), clock);
  let owner = ID;
  const producer = new DevelopmentSimulatorLoginProofProducer({
    environment: 'development',
    enabled: true,
    simulatorHmacKey: new Uint8Array(32).fill(9),
    identityResolver: { resolveRegisteredIdentityId: () => owner },
    proofStore: proofs,
    clock,
  });
  const keys = generateKeyPairSync('ed25519');
  const tokens = new V2AccessToken({
    environment: 'development',
    enabled: true,
    privateKey: keys.privateKey,
    publicKey: keys.publicKey,
    clock,
  });
  const repo = new InMemoryV2SessionRepository(
    [ID, OTHER],
    100,
    clock,
    maxConsumed,
  );
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
  const issue = async (identity = ID) => {
    owner = identity;
    const proof = await producer.issue(web);
    return issuer.issueFromLoginProof({
      loginProof: proof,
      transportContext: web,
      browserBindingCookieHash: hashBrowserBindingCookie(
        bootstrap.cookieSecret,
      ),
    });
  };
  const idempotency = new InMemoryIdempotencyGuard({
    key: new Uint8Array(32).fill(8),
    ttlMs: 86_400_000,
    clock,
  });
  const sessionProof = await producer.issue(web);
  const sessionResponse = responseFixture();
  const tls = new TLSSocket(new Socket());
  sockets.push(tls);
  const sessionRequest = {
    originalUrl: '/v2/auth/session',
    rawHeaders: [
      'Origin',
      ORIGIN,
      'Cookie',
      `st_v2_browser=${bootstrap.cookieSecret}`,
      'Idempotency-Key',
      'session-http-key-0001',
      'X-Browser-Nonce',
      bootstrap.nonce,
    ],
    socket: tls,
  } as unknown as Request;
  const http = new V2WebSessionHttpService({
    environment: 'development',
    enabled: true,
    allowedOrigins: [ORIGIN],
    bindingCookieName: 'st_v2_browser',
    authorityHmacKey: new Uint8Array(32).fill(7),
    nonce,
    issuer,
    principal,
    repository: repo,
    csrf,
    idempotency,
    clock,
  });
  await http.handle(
    { transport: 'web', loginProof: sessionProof },
    'session-http-key-0001',
    bootstrap.nonce,
    sessionRequest,
    sessionResponse.port,
  );
  expect(sessionResponse.response.statusCode).toBe(201);
  const wireCookies = sessionResponse.headers.get('set-cookie') as string[];
  const accessToken = wireCookies[0]!
    .split(';')[0]!
    .slice('st_v2_access='.length);
  const refreshToken = wireCookies[1]!
    .split(';')[0]!
    .slice('st_v2_refresh='.length);
  const initial: Readonly<SessionResponse> = {
    accessToken,
    refreshToken,
    sessionId: (sessionResponse.response.payload as { sessionId: string })
      .sessionId,
  };
  const authority = Object.freeze({
    identityId: ID,
    sessionId: initial.sessionId,
  }) as VerifiedWebSessionAuthority;
  const initialCsrf = (
    sessionResponse.response.payload as { csrfToken: string }
  ).csrfToken;
  const config: V2WebRevocationHttpConfig = {
    environment: 'development',
    enabled: true,
    allowedOrigins: [ORIGIN],
    bindingCookieName: 'st_v2_browser',
    accessTokens: tokens,
    principal,
    repository: repo as Required<
      Pick<
        typeof repo,
        | 'readSession'
        | 'webContextForCurrentSession'
        | 'revokeForCurrentSession'
      >
    >,
    csrf,
    clock,
  };
  const makeRequest = (
    credential = initial,
    cookie = bootstrap.cookieSecret,
  ) => {
    const socket = new TLSSocket(new Socket());
    sockets.push(socket);
    return {
      originalUrl: `/v2/me/sessions/${credential.sessionId}`,
      rawHeaders: [
        'Origin',
        ORIGIN,
        'Cookie',
        `st_v2_access=${credential.accessToken}; st_v2_browser=${cookie}`,
        'X-Session-CSRF',
        initialCsrf,
      ],
      socket,
    } as unknown as Request;
  };
  const run = async (
    target = initial.sessionId,
    options: { csrf?: string; request?: Request; body?: unknown } = {},
    response = responseFixture(),
  ) => {
    const request = options.request ?? makeRequest();
    if (!options.request && options.csrf !== undefined)
      request.rawHeaders[5] = options.csrf;
    await new V2WebRevocationHttpService(config).handle(
      target,
      options.body,
      options.csrf ?? initialCsrf,
      request,
      response.port,
    );
    return response;
  };
  return {
    bootstrap,
    web,
    issue,
    initial,
    initialCsrf,
    authority,
    csrf,
    csrfStore,
    repo,
    principal,
    tokens,
    config,
    makeRequest,
    run,
    clock,
    setNow: (value: number) => {
      now = value;
    },
  };
}

afterEach(() => {
  for (const socket of sockets.splice(0)) socket.destroy();
  BankIdSimulator.prototype.verify = originalVerify;
  vi.restoreAllMocks();
});

describe('development web revocation HTTP trust boundaries', () => {
  it('revokes a sibling over a real bootstrap-derived access credential and preserves caller CSRF and neighbors', async () => {
    const f = await fixture();
    const sibling = await f.issue();
    const neighbor = await f.issue();
    const result = await f.run(sibling.sessionId);
    expect(result.response.statusCode).toBe(204);
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(result.headers.get('pragma')).toBe('no-cache');
    expect(result.response.payload).toBeUndefined();
    expect(
      f.repo.readSession(sibling.sessionId, { userId: ID }, f.clock()),
    ).toBeNull();
    expect(
      f.repo.readSession(neighbor.sessionId, { userId: ID }, f.clock()),
    ).not.toBeNull();
    expect(() => f.csrf.verify(f.authority, f.initialCsrf)).not.toThrow();
  });

  it('checks CSRF before revocation and returns the same missing response for absent and foreign targets', async () => {
    const f = await fixture();
    const sibling = await f.issue();
    const foreign = await f.issue(OTHER);
    const bad = await f.run(sibling.sessionId, { csrf: 'A'.repeat(43) });
    expect(bad.response.statusCode).toBe(403);
    expect(
      f.repo.readSession(sibling.sessionId, { userId: ID }, f.clock()),
    ).not.toBeNull();
    const missing = await f.run('123e4567-e89b-42d3-a456-426614174099');
    const hidden = await f.run(foreign.sessionId);
    expect(missing.response.statusCode).toBe(404);
    expect(hidden.response.statusCode).toBe(404);
    expect(hidden.response.payload).toEqual(missing.response.payload);
  });

  it('commits self revocation before invalidating only that caller CSRF state', async () => {
    const f = await fixture();
    const other = await f.issue();
    const self = await f.run();
    expect(self.response.statusCode).toBe(204);
    expect(() => f.csrf.verify(f.authority, f.initialCsrf)).toThrow();
    expect(
      f.repo.readSession(other.sessionId, { userId: ID }, f.clock()),
    ).not.toBeNull();
    const stale = await f.run();
    expect(stale.response.statusCode).toBe(401);
  });

  it.each([
    'query',
    'authorization',
    'alias',
    'duplicate-cookie',
    'refresh-cookie',
    'body',
  ] as const)('rejects ambiguous %s input before mutation', async (kind) => {
    const f = await fixture();
    const sibling = await f.issue();
    const request = f.makeRequest();
    if (kind === 'query') request.originalUrl += '?x=1';
    if (kind === 'authorization')
      (request.rawHeaders as string[]).push(
        'Authorization',
        `Bearer ${f.initial.accessToken}`,
      );
    if (kind === 'alias')
      (request.rawHeaders as string[]).push('X-CSRF-Token', f.initialCsrf);
    if (kind === 'duplicate-cookie')
      (request.rawHeaders as string[]).push(
        'Cookie',
        `st_v2_access=${f.initial.accessToken}`,
      );
    if (kind === 'refresh-cookie')
      (request.rawHeaders as string[])[3] +=
        '; st_v2_refresh=refresh-token-should-not-be-sent';
    const result = await f.run(sibling.sessionId, {
      request,
      body: kind === 'body' ? {} : undefined,
    });
    expect(result.response.statusCode).toBe(400);
    expect(
      f.repo.readSession(sibling.sessionId, { userId: ID }, f.clock()),
    ).not.toBeNull();
  });

  it('rechecks the caller after principal resolution awaits and preserves target on caller deletion', async () => {
    const f = await fixture();
    const sibling = await f.issue();
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const resolve = f.principal.resolve.bind(f.principal);
    Object.defineProperty(f.config, 'principal', {
      value: {
        resolve: async (...args: Parameters<typeof resolve>) => {
          await wait;
          return resolve(...args);
        },
      },
    });
    const pending = f.run(sibling.sessionId);
    await Promise.resolve();
    await Promise.resolve();
    f.repo.revokeForCurrentSession(
      f.initial.sessionId,
      f.initial.sessionId,
      { userId: ID },
      f.clock(),
    );
    release();
    expect((await pending).response.statusCode).toBe(401);
    expect(
      f.repo.readSession(sibling.sessionId, { userId: ID }, f.clock()),
    ).not.toBeNull();
  });

  it('fails closed when self-CSRF invalidation fails after commit', async () => {
    const f = await fixture();
    vi.spyOn(f.csrf, 'invalidate').mockImplementation(() => {
      throw new Error('fixture');
    });
    const response = await f.run();
    expect(response.response.statusCode).toBe(500);
    expect(
      f.repo.readSession(f.initial.sessionId, { userId: ID }, f.clock()),
    ).toBeNull();
  });
});

describe('revocation fault and race guarantees', () => {
  it.each(['expiry', 'clock-regression', 'changed-binding'] as const)(
    'rejects %s after an already verified principal awaits',
    async (fault) => {
      const f = await fixture();
      const target = await f.issue();
      const original = f.principal.resolve.bind(f.principal);
      let changed = false;
      const webContext = f.repo.webContextForCurrentSession.bind(f.repo);
      vi.spyOn(f.repo, 'webContextForCurrentSession').mockImplementation(
        (...args) =>
          changed
            ? Object.freeze({ ...f.web, browserChainId: 'changed' })
            : webContext(...args),
      );
      Object.defineProperty(f.config, 'principal', {
        value: {
          resolve: async (...args: Parameters<typeof original>) => {
            const principal = await original(...args);
            if (fault === 'expiry') f.setNow(NOW + 900_000);
            if (fault === 'clock-regression') f.setNow(NOW - 1);
            if (fault === 'changed-binding') changed = true;
            return principal;
          },
        },
      });
      const result = await f.run(target.sessionId);
      expect(result.response.statusCode).toBe(401);
      f.setNow(NOW);
      expect(
        f.repo.readSession(target.sessionId, { userId: ID }, NOW),
      ).not.toBeNull();
    },
  );
  it('preserves live consumed history and all sessions when capacity prevents revocation', async () => {
    const f = await fixture(1);
    const prior = await f.issue();
    const target = await f.issue();
    expect((await f.run(prior.sessionId)).response.statusCode).toBe(204);
    expect((await f.run(target.sessionId)).response.statusCode).toBe(500);
    expect(
      f.repo.readSession(target.sessionId, { userId: ID }, NOW),
    ).not.toBeNull();
    expect(
      f.repo.readSession(f.initial.sessionId, { userId: ID }, NOW),
    ).not.toBeNull();
    expect(() => f.csrf.verify(f.authority, f.initialCsrf)).not.toThrow();
  });
  it('throttles the 61st request without changing session state', async () => {
    const f = await fixture();
    const target = await f.issue();
    const service = new V2WebRevocationHttpService(f.config);
    for (let i = 0; i < 61; i++) {
      const req = f.makeRequest();
      req.rawHeaders[5] = 'A'.repeat(43);
      const out = responseFixture();
      await service.handle(
        target.sessionId,
        undefined,
        'A'.repeat(43),
        req,
        out.port,
      );
      expect(out.response.statusCode).toBe(i < 60 ? 403 : 429);
    }
    expect(
      f.repo.readSession(target.sessionId, { userId: ID }, NOW),
    ).not.toBeNull();
  });
  it.each([
    'nonTLS',
    'duplicate-origin',
    'duplicate-csrf',
    'nonce',
    'transfer',
    'nonzero-length',
    'quoted-cookie',
    'missing-binding',
  ] as const)('rejects %s before mutation', async (fault) => {
    const f = await fixture();
    const target = await f.issue();
    const request = f.makeRequest();
    if (fault === 'nonTLS')
      Object.defineProperty(request, 'socket', { value: new Socket() });
    if (fault === 'duplicate-origin') request.rawHeaders.push('Origin', ORIGIN);
    if (fault === 'duplicate-csrf')
      request.rawHeaders.push('X-Session-CSRF', f.initialCsrf);
    if (fault === 'nonce')
      request.rawHeaders.push('X-Browser-Nonce', 'untrusted');
    if (fault === 'transfer')
      request.rawHeaders.push('Transfer-Encoding', 'chunked');
    if (fault === 'nonzero-length')
      request.rawHeaders.push('Content-Length', '1');
    if (fault === 'quoted-cookie')
      request.rawHeaders[3] =
        'st_v2_access="quoted"; st_v2_browser=' + f.bootstrap.cookieSecret;
    if (fault === 'missing-binding')
      request.rawHeaders[3] = 'st_v2_access=' + f.initial.accessToken;
    expect(
      (await f.run(target.sessionId, { request })).response.statusCode,
    ).toBe(400);
    expect(
      f.repo.readSession(target.sessionId, { userId: ID }, NOW),
    ).not.toBeNull();
  });
  it.each([
    'claims-getter',
    'principal-getter',
    'hostile-promise',
    'row-getter',
    'outcome-getter',
    'nonvoid-csrf',
  ] as const)(
    'fails closed on %s without touching getters or guessing commit',
    async (fault) => {
      const f = await fixture();
      const target = await f.issue();
      let touched = 0;
      const hostile = Object.defineProperty({}, 'identityId', {
        enumerable: true,
        get() {
          touched++;
          throw new Error('getter');
        },
      });
      if (fault === 'claims-getter')
        Object.defineProperty(f.config, 'accessTokens', {
          value: { verify: () => hostile },
        });
      if (fault === 'principal-getter')
        Object.defineProperty(f.config, 'principal', {
          value: { resolve: async () => hostile },
        });
      if (fault === 'hostile-promise')
        Object.defineProperty(f.config, 'principal', {
          value: {
            resolve: () =>
              Object.defineProperty(
                Promise.resolve({
                  identityId: ID,
                  sessionId: f.initial.sessionId,
                }),
                'then',
                {
                  get() {
                    touched++;
                    throw new Error('getter');
                  },
                },
              ),
          },
        });
      if (fault === 'row-getter')
        vi.spyOn(f.repo, 'readSession').mockReturnValue(hostile as never);
      if (fault === 'outcome-getter')
        vi.spyOn(f.repo, 'revokeForCurrentSession').mockReturnValue(
          Object.defineProperty({}, 'kind', {
            enumerable: true,
            get() {
              touched++;
              throw new Error('getter');
            },
          }) as never,
        );
      if (fault === 'nonvoid-csrf')
        vi.spyOn(f.csrf, 'verify').mockReturnValue(true as never);
      expect((await f.run(target.sessionId)).response.statusCode).toBe(500);
      expect(touched).toBe(0);
      vi.restoreAllMocks();
      expect(
        f.repo.readSession(target.sessionId, { userId: ID }, NOW),
      ).not.toBeNull();
    },
  );
  it('never restores a revoked session when response delivery fails', async () => {
    const f = await fixture();
    const target = await f.issue();
    const out = responseFixture();
    out.response.end.mockImplementation(() => {
      throw new Error('delivery');
    });
    expect((await f.run(target.sessionId, {}, out)).response.statusCode).toBe(
      500,
    );
    expect(
      f.repo.readSession(target.sessionId, { userId: ID }, NOW),
    ).toBeNull();
    expect(() => f.csrf.verify(f.authority, f.initialCsrf)).not.toThrow();
  });
  it.each([
    'config-getter',
    'origin-getter',
    'method-getter',
    'production',
    'cookie-collision',
  ] as const)(
    'rejects %s registration without evaluating getters',
    async (fault) => {
      const f = await fixture();
      let touched = 0;
      const config = { ...f.config };
      if (fault === 'config-getter')
        Object.defineProperty(config, 'enabled', {
          enumerable: true,
          get() {
            touched++;
            return true;
          },
        });
      if (fault === 'origin-getter') {
        const origins = [ORIGIN];
        Object.defineProperty(origins, '0', {
          enumerable: true,
          get() {
            touched++;
            return ORIGIN;
          },
        });
        Object.defineProperty(config, 'allowedOrigins', { value: origins });
      }
      if (fault === 'method-getter')
        Object.defineProperty(config, 'accessTokens', {
          value: Object.defineProperty({}, 'verify', {
            get() {
              touched++;
              return () => null;
            },
          }),
        });
      if (fault === 'production')
        Object.defineProperty(config, 'environment', { value: 'production' });
      if (fault === 'cookie-collision')
        Object.defineProperty(config, 'bindingCookieName', {
          value: 'st_v2_access',
        });
      expect(() => new V2WebRevocationHttpService(config)).toThrow();
      expect(() => V2WebRevocationHttpModule.register(config)).toThrow();
      expect(touched).toBe(0);
    },
  );
});
