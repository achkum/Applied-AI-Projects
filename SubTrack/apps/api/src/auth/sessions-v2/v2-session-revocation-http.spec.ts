import { generateKeyPairSync } from 'node:crypto';
import { Socket } from 'node:net';
import { TLSSocket } from 'node:tls';
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
} from '../session-csrf/session-csrf';
import { DevelopmentV2PrincipalResolver } from './v2-principal-resolver';
import {
  DevelopmentV2SessionIssuer,
  InMemoryV2SessionRepository,
} from './v2-session-issuer';
import { V2AccessToken } from './v2-access-token';
import { V2WebSessionHttpService } from './v2-web-session-http';
import { V2WebRevocationHttpService } from './v2-web-revocation-http';
import { V2MobileRevocationHttpService } from './v2-mobile-revocation-http';
import { V2SessionRevocationHttpService } from './v2-session-revocation-http';
import { V2SessionRevocationHttpModule } from './v2-session-revocation-http.module';
import { hashBrowserBindingCookie } from './v2-web-session-binding';

const NOW = 1_800_000_000_000;
const ORIGIN = 'https://app.example';
const ID = '123e4567-e89b-42d3-a456-426614174000';
const OTHER = '123e4567-e89b-42d3-a456-426614174001';
const MOBILE = Object.freeze({ transport: 'mobile' as const });
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
    send: vi.fn((payload: unknown) => {
      response.payload = payload;
      response.headersSent = true;
      return response;
    }),
    end: vi.fn(() => {
      response.headersSent = true;
      return response;
    }),
  };
  return { response, headers, port: response as unknown as Response };
}

async function fixture() {
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
  const proofStore = new ProofStore(new InMemoryProofRepository(), clock);
  let owner = ID;
  const producer = new DevelopmentSimulatorLoginProofProducer({
    environment: 'development',
    enabled: true,
    simulatorHmacKey: new Uint8Array(32).fill(9),
    identityResolver: { resolveRegisteredIdentityId: () => owner },
    proofStore,
    clock,
  });
  const pair = generateKeyPairSync('ed25519');
  const accessTokens = new V2AccessToken({
    environment: 'development',
    enabled: true,
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    clock,
  });
  const repository = new InMemoryV2SessionRepository([ID, OTHER], 100, clock);
  const issuer = new DevelopmentV2SessionIssuer({
    environment: 'development',
    enabled: true,
    proofStore,
    accessTokens,
    repository,
    clock,
  });
  const principal = new DevelopmentV2PrincipalResolver({
    environment: 'development',
    enabled: true,
    accessTokens,
    reader: repository,
    clock,
  });
  const csrf = new SessionCsrfGuard(new InMemorySessionCsrfStore());
  const idempotency = new InMemoryIdempotencyGuard({
    key: new Uint8Array(32).fill(8),
    ttlMs: 86_400_000,
    clock,
  });
  const issue = async (
    transport: typeof MOBILE | typeof web,
    identity = ID,
  ) => {
    owner = identity;
    return issuer.issueFromLoginProof({
      loginProof: await producer.issue(transport),
      transportContext: transport,
      ...(transport.transport === 'web'
        ? {
            browserBindingCookieHash: hashBrowserBindingCookie(
              bootstrap.cookieSecret,
            ),
          }
        : {}),
    });
  };
  // A real web-session response establishes the same CSRF authority and binding
  // cookie that the accepted web revocation service expects.
  const sessionProof = await producer.issue(web);
  const sessionResponse = responseFixture();
  const sessionSocket = new TLSSocket(new Socket());
  sockets.push(sessionSocket);
  const sessionRequest = {
    originalUrl: '/v2/auth/session',
    rawHeaders: [
      'Origin',
      ORIGIN,
      'Cookie',
      `st_v2_browser=${bootstrap.cookieSecret}`,
      'Idempotency-Key',
      'fixture-session-key-01',
      'X-Browser-Nonce',
      bootstrap.nonce,
    ],
    socket: sessionSocket,
  } as unknown as Request;
  const webHttp = new V2WebSessionHttpService({
    environment: 'development',
    enabled: true,
    allowedOrigins: [ORIGIN],
    bindingCookieName: 'st_v2_browser',
    authorityHmacKey: new Uint8Array(32).fill(7),
    nonce,
    issuer,
    principal,
    repository,
    csrf,
    idempotency,
    clock,
  });
  await webHttp.handle(
    { transport: 'web', loginProof: sessionProof },
    'fixture-session-key-01',
    bootstrap.nonce,
    sessionRequest,
    sessionResponse.port,
  );
  expect(sessionResponse.response.statusCode).toBe(201);
  const cookies = sessionResponse.headers.get('set-cookie') as string[];
  const access = cookies[0]!.split(';')[0]!.slice('st_v2_access='.length);
  const webSessionId = (
    sessionResponse.response.payload as { sessionId: string }
  ).sessionId;
  const csrfToken = (sessionResponse.response.payload as { csrfToken: string })
    .csrfToken;
  const config = {
    environment: 'development' as const,
    enabled: true as const,
    allowedOrigins: [ORIGIN],
    bindingCookieName: 'st_v2_browser',
    accessTokens,
    principal,
    repository,
    csrf,
    clock,
  };
  const makeRequest = (
    token: string,
    mode: 'web' | 'mobile',
    target: string,
    csrfValue = csrfToken,
  ) => {
    const socket = new TLSSocket(new Socket());
    sockets.push(socket);
    return {
      originalUrl: `/v2/me/sessions/${target}`,
      socket,
      secure: true,
      rawHeaders:
        mode === 'web'
          ? [
              'Origin',
              ORIGIN,
              'Cookie',
              `st_v2_access=${access}; st_v2_browser=${bootstrap.cookieSecret}`,
              'X-Session-CSRF',
              csrfValue,
            ]
          : ['Authorization', `Bearer ${token}`],
    } as unknown as Request;
  };
  const dispatch = (target: string, request: Request, body?: unknown) => {
    const out = responseFixture();
    return {
      out,
      promise: new V2SessionRevocationHttpService(config).handle(
        target,
        body,
        request,
        out.port,
      ),
    };
  };
  return {
    config,
    accessTokens,
    principal,
    repository,
    csrf,
    issue,
    makeRequest,
    dispatch,
    webSessionId,
    csrfToken,
    setNow: (value: number) => {
      now = value;
    },
    clock,
  };
}

afterEach(() => {
  for (const socket of sockets.splice(0)) socket.destroy();
  BankIdSimulator.prototype.verify = originalVerify;
  vi.restoreAllMocks();
});

describe('development unified session revocation dispatcher', () => {
  it('delegates a real web credential to the accepted web service and preserves CSRF authority', async () => {
    const f = await fixture();
    const target = await f.issue(
      Object.freeze({
        transport: 'web',
        exactOrigin: ORIGIN,
        browserChainId: 'web-chain',
      }),
    );
    const request = f.makeRequest('', 'web', target.sessionId);
    const spy = vi.spyOn(V2WebRevocationHttpService.prototype, 'handle');
    const mobile = vi.spyOn(V2MobileRevocationHttpService.prototype, 'handle');
    const { out, promise } = f.dispatch(target.sessionId, request);
    await promise;
    expect(spy).toHaveBeenCalledTimes(1);
    expect(mobile).not.toHaveBeenCalled();
    expect(out.response.statusCode).toBe(204);
    expect(out.headers.get('cache-control')).toBe('no-store');
    expect(
      f.repository.readSession(target.sessionId, { userId: ID }, f.clock()),
    ).toBeNull();
    expect(() =>
      f.csrf.verify(
        Object.freeze({ identityId: ID, sessionId: f.webSessionId }) as never,
        f.csrfToken,
      ),
    ).not.toThrow();
  });

  it('delegates an issued mobile bearer to the accepted mobile service without web CSRF authority', async () => {
    const f = await fixture();
    const caller = await f.issue(MOBILE);
    const target = await f.issue(MOBILE);
    const request = f.makeRequest(
      caller.accessToken,
      'mobile',
      target.sessionId,
    );
    const web = vi.spyOn(V2WebRevocationHttpService.prototype, 'handle');
    const mobile = vi.spyOn(V2MobileRevocationHttpService.prototype, 'handle');
    const { out, promise } = f.dispatch(target.sessionId, request);
    await promise;
    expect(mobile).toHaveBeenCalledTimes(1);
    expect(web).not.toHaveBeenCalled();
    expect(out.response.statusCode).toBe(204);
    expect(
      f.repository.readSession(target.sessionId, { userId: ID }, f.clock()),
    ).toBeNull();
  });

  it.each([
    [
      'duplicate access cookie',
      'web',
      ['Cookie', 'st_v2_access=x; st_v2_access=y'],
    ],
    [
      'quoted malformed cookie',
      'web',
      ['Cookie', 'st_v2_access="bad; st_v2_browser=x'],
    ],
    ['authorization mixed with web', 'web', ['Authorization', 'Basic secret']],
    ['cookie mixed with mobile', 'mobile', ['Cookie', 'unrelated=value']],
    [
      'duplicate authorization',
      'mobile',
      ['Authorization', 'Bearer duplicate'],
    ],
    ['unknown scheme', 'mobile', ['Authorization', 'Basic abc']],
  ] as const)(
    'rejects %s before either service or mutation',
    async (_label, mode, extra) => {
      const f = await fixture();
      const caller = await f.issue(MOBILE);
      const target = await f.issue(MOBILE);
      const request = f.makeRequest(caller.accessToken, mode, target.sessionId);
      (request.rawHeaders as string[]).push(...extra);
      const web = vi.spyOn(V2WebRevocationHttpService.prototype, 'handle');
      const mobile = vi.spyOn(
        V2MobileRevocationHttpService.prototype,
        'handle',
      );
      const { out, promise } = f.dispatch(target.sessionId, request);
      await promise;
      expect(web).not.toHaveBeenCalled();
      expect(mobile).not.toHaveBeenCalled();
      expect(out.response.statusCode).toBe(400);
      expect(out.headers.get('cache-control')).toBe('no-store');
      expect(
        f.repository.readSession(target.sessionId, { userId: ID }, f.clock()),
      ).not.toBeNull();
    },
  );

  it('never falls back when the selected real service fails, and avoids a second response after headers are sent', async () => {
    const f = await fixture();
    const caller = await f.issue(MOBILE);
    const target = await f.issue(MOBILE);
    const request = f.makeRequest(
      caller.accessToken,
      'mobile',
      target.sessionId,
    );
    const web = vi.spyOn(V2WebRevocationHttpService.prototype, 'handle');
    const mobile = vi
      .spyOn(V2MobileRevocationHttpService.prototype, 'handle')
      .mockRejectedValue(new Error('selected branch failed'));
    const { out, promise } = f.dispatch(target.sessionId, request);
    await promise;
    expect(mobile).toHaveBeenCalledTimes(1);
    expect(web).not.toHaveBeenCalled();
    expect(out.response.statusCode).toBe(500);
    expect(out.response.payload).not.toHaveProperty('message');
    expect(
      f.repository.readSession(target.sessionId, { userId: ID }, f.clock()),
    ).not.toBeNull();

    const sent = responseFixture();
    sent.response.headersSent = true;
    mobile.mockRejectedValueOnce(new Error('late failure'));
    await new V2SessionRevocationHttpService(f.config).handle(
      target.sessionId,
      undefined,
      request,
      sent.port,
    );
    expect(sent.response.status).not.toHaveBeenCalled();
    expect(sent.response.send).not.toHaveBeenCalled();
  });

  it('captures strict config and collaborator methods without evaluating getters', () => {
    const getter = vi.fn(() => true);
    const bad = {
      ...{
        environment: 'development',
        enabled: true,
        allowedOrigins: [ORIGIN],
        bindingCookieName: 'st_v2_browser',
      },
      accessTokens: {},
      principal: {},
      repository: {},
      csrf: {},
      clock: () => NOW,
    };
    Object.defineProperty(bad, 'enabled', { enumerable: true, get: getter });
    expect(() => new V2SessionRevocationHttpService(bad as never)).toThrow();
    expect(() =>
      V2SessionRevocationHttpModule.register(bad as never),
    ).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
});

describe('dispatcher registration capture and raw ambiguity', () => {
  it('captures verifier methods at module registration rather than at later Nest creation', async () => {
    const f = await fixture();
    const caller = await f.issue(MOBILE);
    const target = await f.issue(MOBILE);
    const verifier = { verify: f.accessTokens.verify.bind(f.accessTokens) };
    const module = V2SessionRevocationHttpModule.register({
      ...f.config,
      accessTokens: verifier,
    });
    const provider = module.providers!.find(
      (p) => typeof p === 'object' && p !== null && 'useValue' in p,
    ) as { useValue: typeof f.config };
    verifier.verify = () => {
      throw new Error('late verifier mutation');
    };
    const out = responseFixture();
    await new V2SessionRevocationHttpService(provider.useValue).handle(
      target.sessionId,
      undefined,
      f.makeRequest(caller.accessToken, 'mobile', target.sessionId),
      out.port,
    );
    expect(out.response.statusCode).toBe(204);
  });
  it.each([
    'duplicate-binding',
    'duplicate-unrelated',
    'odd-raw-headers',
  ] as const)('rejects %s before either service executes', async (fault) => {
    const f = await fixture();
    const target = await f.issue(MOBILE);
    const req = f.makeRequest('', 'web', target.sessionId);
    if (fault === 'duplicate-binding')
      req.rawHeaders[3] += '; st_v2_browser=other';
    if (fault === 'duplicate-unrelated')
      req.rawHeaders[3] += '; other=first; other=second';
    if (fault === 'odd-raw-headers') req.rawHeaders.push('Authorization');
    const web = vi.spyOn(V2WebRevocationHttpService.prototype, 'handle');
    const mobile = vi.spyOn(V2MobileRevocationHttpService.prototype, 'handle');
    const result = f.dispatch(target.sessionId, req);
    await result.promise;
    expect(result.out.response.statusCode).toBe(400);
    expect(web).not.toHaveBeenCalled();
    expect(mobile).not.toHaveBeenCalled();
    expect(
      f.repository.readSession(target.sessionId, { userId: ID }, NOW),
    ).not.toBeNull();
  });
  it.each(['port-getter', 'origin-getter', 'origin-extra'] as const)(
    'rejects %s in both registration paths without getter evaluation',
    async (fault) => {
      const f = await fixture();
      let touched = 0;
      const config = { ...f.config };
      if (fault === 'port-getter')
        Object.defineProperty(config, 'accessTokens', {
          value: Object.defineProperty({}, 'verify', {
            get() {
              touched++;
              return () => null;
            },
          }),
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
      if (fault === 'origin-extra') {
        const origins = [ORIGIN];
        Object.defineProperty(origins, 'hidden', { value: ORIGIN });
        Object.defineProperty(config, 'allowedOrigins', { value: origins });
      }
      expect(() => V2SessionRevocationHttpModule.register(config)).toThrow();
      expect(() => new V2SessionRevocationHttpService(config)).toThrow();
      expect(touched).toBe(0);
    },
  );
});
