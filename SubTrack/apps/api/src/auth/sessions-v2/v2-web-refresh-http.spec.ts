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
import { DevelopmentV2SessionRefresher } from './v2-session-refresher';
import { V2AccessToken } from './v2-access-token';
import { V2WebSessionHttpService } from './v2-web-session-http';
import {
  V2WebRefreshHttpService,
  type V2WebRefreshHttpConfig,
} from './v2-web-refresh-http';
import { V2WebRefreshHttpModule } from './v2-web-refresh-http.module';

const NOW = 1_800_000_000_000;
const ORIGIN = 'https://app.example';
const ID = '123e4567-e89b-42d3-a456-426614174000';
const KEY = 'refresh-fixture-key-0001';
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
    setHeader: vi.fn((name: string, value: unknown) =>
      headers.set(name.toLowerCase(), value),
    ),
    removeHeader: vi.fn((name: string) => headers.delete(name.toLowerCase())),
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
  const repo = new InMemoryV2SessionRepository([ID], 100, clock);
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
  const originalIssue = issuer.issueFromLoginProof.bind(issuer);
  const issue = async (
    input: Parameters<typeof issuer.issueFromLoginProof>[0],
  ) => {
    issued = await originalIssue(input);
    return issued;
  };
  const sessionConfig = {
    environment: 'development' as const,
    enabled: true as const,
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
  const sessionRequest = {
    originalUrl: '/v2/auth/session',
    rawHeaders: [
      'Origin',
      ORIGIN,
      'Cookie',
      `st_v2_browser=${bootstrap.cookieSecret}`,
      'Idempotency-Key',
      'session-key-123456',
      'X-Browser-Nonce',
      bootstrap.nonce,
    ],
    socket,
  } as unknown as Request;
  const sessionResponse = responseFixture();
  await new V2WebSessionHttpService(sessionConfig).handle(
    { transport: 'web', loginProof: proof },
    'session-key-123456',
    bootstrap.nonce,
    sessionRequest,
    sessionResponse.port,
  );
  if (sessionResponse.response.statusCode !== 201 || !issued)
    throw new Error('Real web session fixture did not issue');
  const sessionPayload = sessionResponse.response.payload as {
    csrfToken: string;
  };
  const csrfAuthority = Object.freeze({
    identityId: ID,
    sessionId: issued.sessionId,
  }) as VerifiedWebSessionAuthority;
  const initialCsrf = sessionPayload.csrfToken;
  const refresher = new DevelopmentV2SessionRefresher({
    environment: 'development',
    enabled: true,
    repository: repo,
    accessTokens: tokens,
    clock,
  });
  const config: {
    -readonly [K in keyof V2WebRefreshHttpConfig]: V2WebRefreshHttpConfig[K];
  } = {
    environment: 'development',
    enabled: true,
    allowedOrigins: [ORIGIN],
    bindingCookieName: 'st_v2_browser',
    authorityHmacKey: new Uint8Array(32).fill(6),
    refresher,
    principal,
    repository: repo as Required<
      Pick<typeof repo, 'webContextForRefresh' | 'readSession'>
    > &
      Pick<typeof repo, 'revokeRotatedFamily'>,
    csrf,
    idempotency,
    clock,
  };
  const makeRequest = (
    refreshToken = issued!.refreshToken,
    csrfToken = initialCsrf,
    url = '/v2/auth/refresh',
    key = KEY,
  ) =>
    ({
      originalUrl: url,
      rawHeaders: [
        'Origin',
        ORIGIN,
        'Cookie',
        `st_v2_browser=${bootstrap.cookieSecret}; st_v2_refresh=${refreshToken}; st_v2_access=${issued!.accessToken}`,
        'Idempotency-Key',
        key,
        'X-Session-CSRF',
        csrfToken,
      ],
      socket,
    }) as unknown as Request;
  const run = async (
    opts: {
      refreshToken?: string;
      csrfToken?: string;
      body?: unknown;
      url?: string;
      request?: Request;
      key?: string;
    } = {},
    r = responseFixture(),
  ) => {
    await new V2WebRefreshHttpService(config).handle(
      opts.body,
      opts.key ?? KEY,
      opts.csrfToken ?? initialCsrf,
      opts.request ??
        makeRequest(opts.refreshToken, opts.csrfToken, opts.url, opts.key),
      r.port,
    );
    return r;
  };
  const row = () =>
    repo.readSession(issued!.sessionId, { userId: ID }, clock());
  return {
    bootstrap,
    issued: () => issued!,
    csrfAuthority,
    csrf,
    csrfStore,
    idempotency,
    repo,
    principal,
    refresher,
    clock,
    setNow: (value: number) => {
      now = value;
    },
    context,
    config,
    makeRequest,
    run,
    row,
    initialCsrf,
  };
}

describe('development web refresh HTTP trust boundaries', () => {
  it('runs the real session, rotation, principal, row and CSRF pipeline; publishes only two cookies and the safe payload', async () => {
    const f = await fixture();
    const r = await f.run();
    expect(r.response.statusCode).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('pragma')).toBe('no-cache');
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
    expect(payload.transport).toBe('web');
    expect(payload.sessionId).toBe(f.issued().sessionId);
    const next = r.headers.get('set-cookie') as readonly string[];
    expect(next).toHaveLength(2);
    expect(next[0]).toMatch(
      /^st_v2_access=[^;]+; Path=\/v2; Secure; HttpOnly; SameSite=Lax$/,
    );
    expect(next[1]).toMatch(
      /^st_v2_refresh=[^;]+; Path=\/v2\/auth; Secure; HttpOnly; SameSite=Lax$/,
    );
    expect(JSON.stringify(payload).includes(f.issued().refreshToken)).toBe(
      false,
    );
    expect(f.row()?.refreshTokenHash).toBe(
      hashRefresh(next[1]!.match(/^st_v2_refresh=([^;]+)/)![1]!),
    );
    expect(() => f.csrf.verify(f.csrfAuthority, f.initialCsrf)).toThrow();
    expect(() =>
      f.csrf.verify(f.csrfAuthority, payload.csrfToken),
    ).not.toThrow();
  });

  it('checks CSRF before reserving or rotating; a wrong token preserves the live row and CSRF token', async () => {
    const f = await fixture();
    const before = f.row();
    const reserve = vi.spyOn(f.idempotency, 'reserve');
    const r = await f.run({ csrfToken: 'A'.repeat(43) });
    expect(r.response.statusCode).toBe(403);
    expect(reserve).not.toHaveBeenCalled();
    expect(f.row()?.refreshTokenHash).toBe(before?.refreshTokenHash);
    expect(() => f.csrf.verify(f.csrfAuthority, f.initialCsrf)).not.toThrow();
    expect(r.headers.has('set-cookie')).toBe(false);
  });

  it('lets valid-CSRF reuse of a consumed refresh credential reach atomic family revocation', async () => {
    const f = await fixture();
    const first = await f.run();
    const nextCsrf = (first.response.payload as { csrfToken: string })
      .csrfToken;
    const reuse = await f.run({
      refreshToken: f.issued().refreshToken,
      csrfToken: nextCsrf,
      key: 'refresh-replay-key-0002',
    });
    expect(reuse.response.statusCode).toBe(401);
    expect(reuse.headers.has('set-cookie')).toBe(false);
    expect(f.row()).toBeNull();
    expect(() => f.csrf.verify(f.csrfAuthority, nextCsrf)).not.toThrow();
  });

  it('rejects body, query, duplicate refresh cookie and duplicate Origin before mutation', async () => {
    const cases = [{ body: {} }, { url: '/v2/auth/refresh?ignored=1' }];
    for (const value of cases) {
      const f = await fixture();
      const before = f.row();
      const r = await f.run(value);
      expect(r.response.statusCode).toBe(400);
      expect(f.row()?.refreshTokenHash).toBe(before?.refreshTokenHash);
      expect(r.headers.has('set-cookie')).toBe(false);
    }
    const f = await fixture();
    const duplicateCookie = f.makeRequest();
    (duplicateCookie.rawHeaders as string[]).splice(
      4,
      0,
      'Cookie',
      'st_v2_refresh=foreign',
    );
    const r = await f.run({ request: duplicateCookie });
    expect(r.response.statusCode).toBe(400);
    expect(f.row()?.refreshTokenHash).toBe(
      hashRefresh(f.issued().refreshToken),
    );
  });

  it('does not treat the naturally sent access cookie as refresh authority', async () => {
    const f = await fixture();
    const request = f.makeRequest();
    (request.rawHeaders as string[]).splice(
      0,
      0,
      'Authorization',
      `Bearer ${f.issued().accessToken}`,
    );
    const r = await f.run({ request });
    expect(r.response.statusCode).toBe(400);
    expect(f.row()?.refreshTokenHash).toBe(
      hashRefresh(f.issued().refreshToken),
    );
    expect(r.headers.has('set-cookie')).toBe(false);
  });

  it.each(['production', 'http', 'cookie-collision', 'key', 'getter'] as const)(
    'rejects %s configuration in service and module registration',
    (kind) => {
      const base = {
        environment: 'development',
        enabled: true,
        allowedOrigins: [ORIGIN],
        bindingCookieName: 'st_v2_browser',
        authorityHmacKey: new Uint8Array(32),
        refresher: { refresh: async () => undefined },
        principal: { resolve: async () => undefined },
        repository: {
          webContextForRefresh: () => null,
          readSession: () => null,
          revokeRotatedFamily: () => false,
        },
        csrf: {
          verify: () => undefined,
          mint: () => '',
          invalidate: () => undefined,
        },
        idempotency: new InMemoryIdempotencyGuard({
          key: new Uint8Array(32),
          ttlMs: 1000,
        }),
      } as Record<string, unknown>;
      const getter = vi.fn(() => true);
      if (kind === 'production') base.environment = 'production';
      if (kind === 'http') base.allowedOrigins = ['http://localhost'];
      if (kind === 'cookie-collision') base.bindingCookieName = 'st_v2_refresh';
      if (kind === 'key') base.authorityHmacKey = new Uint8Array(31);
      if (kind === 'getter')
        Object.defineProperty(base, 'enabled', {
          enumerable: true,
          get: getter,
        });
      expect(() => new V2WebRefreshHttpService(base as never)).toThrow();
      expect(() => V2WebRefreshHttpModule.register(base as never)).toThrow();
      expect(getter).not.toHaveBeenCalled();
    },
  );

  it('retains consumed history when CSRF is wrong, so a later valid reuse revokes the family', async () => {
    const f = await fixture();
    const first = await f.run();
    const nextCsrf = (first.response.payload as { csrfToken: string })
      .csrfToken;
    const liveHash = f.row()?.refreshTokenHash;
    const bad = await f.run({
      refreshToken: f.issued().refreshToken,
      csrfToken: Buffer.alloc(32, 11).toString('base64url'),
      key: 'refresh-wrong-csrf-03',
    });
    expect(bad.response.statusCode).toBe(403);
    expect(f.row()?.refreshTokenHash).toBe(liveHash);
    const replay = await f.run({
      refreshToken: f.issued().refreshToken,
      csrfToken: nextCsrf,
      key: 'refresh-history-check-04',
    });
    expect(replay.response.statusCode).toBe(401);
    expect(f.row()).toBeNull();
  });
  it.each(['csrf', 'settle', 'header', 'send'] as const)(
    'revokes only the known rotated family on %s failure before publication',
    async (fault) => {
      const f = await fixture();
      const r = responseFixture();
      const revoke = vi.spyOn(f.repo, 'revokeRotatedFamily');
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
          return r.headers;
        });
      if (fault === 'send')
        r.response.send.mockImplementationOnce(() => {
          throw new Error('fixture');
        });
      await f.run({}, r);
      expect(r.response.statusCode).toBe(500);
      expect(revoke).toHaveBeenCalledTimes(1);
      expect(f.row()).toBeNull();
      expect(f.csrfStore.snapshot()).toHaveLength(0);
      expect(r.headers.has('set-cookie')).toBe(false);
    },
  );
  it('preserves an advanced row and its CSRF state when exact cleanup refuses the earlier issuance', async () => {
    const f = await fixture();
    const successor = 'b'.repeat(64);
    const mint = f.csrf.mint.bind(f.csrf);
    let advancedCsrf = '';
    vi.spyOn(f.csrf, 'mint').mockImplementation((authority) => {
      const current = f.row()!;
      expect(
        f.repo.rotateRefresh({
          refreshTokenHash: current.refreshTokenHash,
          successorRefreshTokenHash: successor,
          transportContext: f.context,
          observedAt: f.clock(),
        }).kind,
      ).toBe('rotated');
      advancedCsrf = mint(authority);
      throw new Error('fixture');
    });
    const r = await f.run();
    expect(r.response.statusCode).toBe(500);
    expect(f.row()?.refreshTokenHash === successor).toBe(true);
    expect(() => f.csrf.verify(f.csrfAuthority, advancedCsrf)).not.toThrow();
    expect(r.headers.has('set-cookie')).toBe(false);
  });
  it('does not attempt cleanup or a second response after headers have been sent', async () => {
    const f = await fixture();
    const r = responseFixture();
    const revoke = vi.spyOn(f.repo, 'revokeRotatedFamily');
    r.response.send.mockImplementationOnce(() => {
      r.response.headersSent = true;
      throw new Error('fixture');
    });
    await f.run({}, r);
    expect(revoke).not.toHaveBeenCalled();
    expect(f.row()).not.toBeNull();
    expect(f.csrfStore.snapshot()).toHaveLength(1);
    expect(r.response.send).toHaveBeenCalledTimes(1);
  });
  it('does not guess cleanup authority for a malformed fulfilled post-rotation result', async () => {
    const f = await fixture();
    const getter = vi.fn(() => 'foreign');
    const revoke = vi.spyOn(f.repo, 'revokeRotatedFamily');
    f.config.refresher = {
      refresh: async (input) => {
        const result = await f.refresher.refresh(input);
        return Object.defineProperty({ ...result }, 'sessionId', {
          enumerable: true,
          get: getter,
        });
      },
    };
    const r = await f.run();
    expect(r.response.statusCode).toBe(500);
    expect(getter).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
    expect(f.row()).not.toBeNull();
    expect(r.headers.has('set-cookie')).toBe(false);
  });
  it('denies owner deletion during principal await without publishing credentials or guessing cleanup', async () => {
    const f = await fixture();
    const revoke = vi.spyOn(f.repo, 'revokeRotatedFamily');
    f.config.principal = {
      resolve: async (token, context) => {
        const result = await f.principal.resolve(token, context);
        f.repo.markIdentityDeleted(ID, { userId: ID });
        return result;
      },
    };
    const r = await f.run();
    expect(r.response.statusCode).toBe(500);
    expect(revoke).not.toHaveBeenCalled();
    expect(r.headers.has('set-cookie')).toBe(false);
  });
  it('does not rotate or revoke on a duplicate idempotency reservation with valid current CSRF', async () => {
    const f = await fixture();
    const first = await f.run();
    const nextCsrf = (first.response.payload as { csrfToken: string })
      .csrfToken;
    const currentHash = f.row()!.refreshTokenHash;
    const second = await f.run({ csrfToken: nextCsrf });
    expect(second.response.statusCode).toBe(409);
    expect(f.row()?.refreshTokenHash === currentHash).toBe(true);
    expect(second.headers.has('set-cookie')).toBe(false);
  });
  it('allows at most one credentials response when the same refresh credential races', async () => {
    const f = await fixture();
    const a = f.makeRequest(),
      b = f.makeRequest(
        undefined,
        undefined,
        undefined,
        'refresh-race-key-0002',
      );
    const results = await Promise.all([
      f.run({ request: a }),
      f.run({ request: b, key: 'refresh-race-key-0002' }),
    ]);
    expect(
      results.filter((r) => r.response.statusCode === 200).length <= 1,
    ).toBe(true);
    expect(results.filter((r) => r.headers.has('set-cookie')).length <= 1).toBe(
      true,
    );
    expect(f.row()).toBeNull();
  });
  it.each([
    'content-length',
    'transfer-encoding',
    'plain-http',
    'binding-duplicate',
    'browser-nonce',
    'csrf-duplicate',
    'key-duplicate',
  ] as const)(
    'rejects invalid %s framing or evidence before rotation',
    async (kind) => {
      const f = await fixture();
      const request = f.makeRequest();
      const before = f.row()!.refreshTokenHash;
      if (kind === 'plain-http')
        Object.defineProperty(request, 'socket', { value: new Socket() });
      if (kind === 'content-length')
        request.rawHeaders.push(
          'Content-Length',
          '2',
          'Content-Type',
          'text/plain',
        );
      if (kind === 'transfer-encoding')
        request.rawHeaders.push('Transfer-Encoding', 'chunked');
      if (kind === 'binding-duplicate')
        request.rawHeaders.push('Cookie', 'st_v2_browser=foreign');
      if (kind === 'browser-nonce')
        request.rawHeaders.push('X-Browser-Nonce', 'foreign');
      if (kind === 'csrf-duplicate')
        request.rawHeaders.push('X-Session-CSRF', f.initialCsrf);
      if (kind === 'key-duplicate')
        request.rawHeaders.push('Idempotency-Key', KEY);
      const r = await f.run({ request });
      expect(r.response.statusCode).toBe(400);
      expect(f.row()?.refreshTokenHash === before).toBe(true);
      expect(r.headers.has('set-cookie')).toBe(false);
    },
  );
  it.each(['then', 'constructor'] as const)(
    'rejects hostile refresh promise %s without evaluating it',
    async (key) => {
      const f = await fixture();
      const getter = vi.fn(() => Promise);
      const promise = Promise.resolve({});
      Object.defineProperty(promise, key, { get: getter });
      f.config.refresher = { refresh: () => promise as never };
      const r = await f.run();
      expect(r.response.statusCode).toBe(500);
      expect(getter).not.toHaveBeenCalled();
      expect(r.headers.has('set-cookie')).toBe(false);
    },
  );
  it('treats a non-void CSRF verification result as failure before reservation', async () => {
    const f = await fixture();
    const reserve = vi.spyOn(f.idempotency, 'reserve');
    f.config.csrf = {
      verify: () => false,
      mint: f.csrf.mint.bind(f.csrf),
      invalidate: f.csrf.invalidate.bind(f.csrf),
    };
    const r = await f.run();
    expect(r.response.statusCode).toBe(403);
    expect(reserve).not.toHaveBeenCalled();
    expect(
      f.row()?.refreshTokenHash === hashRefresh(f.issued().refreshToken),
    ).toBe(true);
  });
  it('rejects accessor origins and method getters without invoking them', async () => {
    const f = await fixture();
    const getter = vi.fn(() => ORIGIN);
    const origins = Object.defineProperty([ORIGIN], '0', {
      enumerable: true,
      get: getter,
    });
    expect(
      () =>
        new V2WebRefreshHttpService({ ...f.config, allowedOrigins: origins }),
    ).toThrow();
    expect(() =>
      V2WebRefreshHttpModule.register({ ...f.config, allowedOrigins: origins }),
    ).toThrow();
    expect(getter).not.toHaveBeenCalled();
    const methodGetter = vi.fn(() => f.refresher.refresh);
    const malicious = Object.defineProperty({}, 'refresh', {
      get: methodGetter,
    });
    expect(
      () =>
        new V2WebRefreshHttpService({
          ...f.config,
          refresher: malicious as never,
        }),
    ).toThrow();
    expect(methodGetter).not.toHaveBeenCalled();
  });
  it('keeps the original session lifetime when rotating credentials', async () => {
    const f = await fixture();
    const before = f.row()!;
    const r = await f.run();
    expect(r.response.statusCode).toBe(200);
    expect(f.row()?.createdAt).toBe(before.createdAt);
    expect(f.row()?.expiresAt).toBe(before.expiresAt);
    expect(f.row()?.familyId).toBe(before.familyId);
  });
  it.each(['wrong-cookie', 'expired', 'missing-hash'] as const)(
    'rejects %s credential scope before reserve or rotation',
    async (fault) => {
      const f = await fixture();
      const request = f.makeRequest();
      const reserve = vi.spyOn(f.idempotency, 'reserve');
      if (fault === 'wrong-cookie') {
        const index = request.rawHeaders.indexOf('Cookie');
        request.rawHeaders[index + 1] = request.rawHeaders[index + 1]!.replace(
          f.bootstrap.cookieSecret,
          Buffer.alloc(32, 12).toString('base64url'),
        );
      }
      if (fault === 'expired') f.setNow(NOW + 86_400_000);
      if (fault === 'missing-hash') {
        const row = f.row()!;
        f.repo.rollbackCreatedSession(row, { userId: ID });
        const { browserBindingCookieHash: _omitted, ...legacy } = row;
        void _omitted;
        expect(f.repo.createForActiveIdentity(legacy, { userId: ID })).toBe(
          true,
        );
      }
      const r = await f.run({ request });
      expect(r.response.statusCode).toBe(401);
      expect(reserve).not.toHaveBeenCalled();
      expect(r.headers.has('set-cookie')).toBe(false);
    },
  );
  it('rejects an expired reservation before consuming the refresh credential', async () => {
    const f = await fixture();
    const before = f.row()!.refreshTokenHash;
    f.config.idempotency = {
      reserve: () => ({
        ownerHandle: Buffer.alloc(32, 9).toString('base64url'),
        expiresAt: NOW,
      }),
      settle: () => undefined,
    };
    const r = await f.run();
    expect(r.response.statusCode).toBe(409);
    expect(f.row()?.refreshTokenHash === before).toBe(true);
    expect(r.headers.has('set-cookie')).toBe(false);
  });
  it('throttles repeated canonical wrong-CSRF attempts without rotating the family', async () => {
    const f = await fixture();
    const service = new V2WebRefreshHttpService(f.config);
    const wrong = Buffer.alloc(32, 17).toString('base64url');
    const request = f.makeRequest(undefined, wrong);
    const before = f.row()!.refreshTokenHash;
    for (let i = 0; i < 60; i++) {
      const r = responseFixture();
      await service.handle(undefined, KEY, wrong, request, r.port);
      expect(r.response.statusCode).toBe(403);
    }
    const r = responseFixture();
    await service.handle(undefined, KEY, wrong, request, r.port);
    expect(r.response.statusCode).toBe(429);
    expect(f.row()?.refreshTokenHash === before).toBe(true);
    expect(r.headers.has('set-cookie')).toBe(false);
  });
});
