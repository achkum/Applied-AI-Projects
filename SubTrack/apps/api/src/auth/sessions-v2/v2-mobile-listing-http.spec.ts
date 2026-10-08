import { generateKeyPairSync } from 'node:crypto';
import { TLSSocket } from 'node:tls';
import { Socket } from 'node:net';
import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BankIdSimulator } from '../identity-provider/bankid-simulator';
import { DevelopmentSimulatorLoginProofProducer } from '../proofs-v2/bankid-simulator-proof-producer';
import { InMemoryProofRepository, ProofStore } from '../proofs-v2/proof-store';
import { DevelopmentV2PrincipalResolver } from './v2-principal-resolver';
import {
  InMemoryV2SessionRepository,
  DevelopmentV2SessionIssuer,
} from './v2-session-issuer';
import { V2AccessToken } from './v2-access-token';
import {
  V2MobileListingHttpService,
  type V2MobileListingHttpConfig,
} from './v2-mobile-listing-http';

const NOW = 1_800_000_000_000;
const ID = '123e4567-e89b-42d3-a456-426614174000';
const OTHER = '123e4567-e89b-42d3-a456-426614174001';
const originalVerify = BankIdSimulator.prototype.verify;
const sockets: TLSSocket[] = [];
beforeEach(() => {
  vi.spyOn(BankIdSimulator.prototype, 'verify').mockResolvedValue({
    method: 'BANKID',
    name: 'Fixture',
    personnummerHmac: 'a'.repeat(64),
    verifiedAt: new Date(NOW).toISOString(),
  });
});
afterEach(() => {
  for (const socket of sockets.splice(0)) socket.destroy();
  BankIdSimulator.prototype.verify = originalVerify;
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

async function fixture(
  options: {
    principal?: V2MobileListingHttpConfig['principal'];
    repository?: V2MobileListingHttpConfig['repository'];
    clock?: () => number;
  } = {},
) {
  let now = NOW;
  const clock = options.clock ?? (() => now);
  const proofStore = new ProofStore(new InMemoryProofRepository(), clock);
  const producer = new DevelopmentSimulatorLoginProofProducer({
    environment: 'development',
    enabled: true,
    simulatorHmacKey: new Uint8Array(32).fill(9),
    identityResolver: { resolveRegisteredIdentityId: () => ID },
    proofStore,
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
  const repo = new InMemoryV2SessionRepository([ID, OTHER], 100, clock);
  const issuer = new DevelopmentV2SessionIssuer({
    environment: 'development',
    enabled: true,
    proofStore,
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
  const mint = async (
    identityId = ID,
    transport: 'mobile' | 'web' = 'mobile',
    deviceName?: string,
  ) => {
    const proof = await producer.issue(Object.freeze({ transport: 'mobile' }));
    const issued = await issuer.issueFromLoginProof({
      loginProof: proof,
      transportContext: Object.freeze({ transport: 'mobile' }),
      ...(deviceName === undefined ? {} : { deviceName }),
    });
    if (identityId !== ID)
      throw new Error('fixture issuer only creates the registered identity');
    return { ...issued, transport };
  };
  const principalPort = options.principal ?? principal;
  const repositoryPort = options.repository ?? repo;
  const config = {
    environment: 'development' as const,
    enabled: true as const,
    accessTokens: tokens,
    principal: principalPort,
    repository: repositoryPort,
    clock,
  };
  const service = new V2MobileListingHttpService(
    config as V2MobileListingHttpConfig,
  );
  const makeRequest = (
    token: string,
    rawHeaders = ['Authorization', `Bearer ${token}`],
    originalUrl = '/v2/me/sessions',
    socket = new TLSSocket(new Socket()),
  ) => {
    sockets.push(socket);
    return {
      originalUrl,
      rawHeaders,
      headers: {},
      secure: socket instanceof TLSSocket,
      socket,
    } as unknown as Request;
  };
  const run = async (token: string, mutate?: (request: Request) => void) => {
    const req = makeRequest(token);
    mutate?.(req);
    const response = responseFixture();
    await service.handle(undefined, req, response.port);
    return response;
  };
  return {
    clock,
    setNow: (value: number) => {
      now = value;
    },
    proofStore,
    producer,
    issuer,
    principal,
    repo,
    tokens,
    mint,
    config,
    service,
    makeRequest,
    run,
  };
}

describe('development mobile session listing HTTP boundary', () => {
  it('lists only owned web and mobile siblings through the real proof, issuer, token, resolver and repository path', async () => {
    vi.spyOn(BankIdSimulator.prototype, 'verify').mockResolvedValue({
      method: 'BANKID',
      name: 'Fixture',
      personnummerHmac: 'a'.repeat(64),
      verifiedAt: new Date(NOW).toISOString(),
    });
    const f = await fixture();
    const old = await f.mint(ID, 'mobile', 'Old phone');
    const proof = await f.producer.issue(
      Object.freeze({
        transport: 'web',
        exactOrigin: 'https://app.example',
        browserChainId: 'chain-a',
      }),
    );
    const web = await f.issuer.issueFromLoginProof({
      loginProof: proof,
      transportContext: Object.freeze({
        transport: 'web',
        exactOrigin: 'https://app.example',
        browserChainId: 'chain-a',
      }),
    });
    const caller = await f.mint(ID, 'mobile', 'Current phone');
    const foreignProofStore = new ProofStore(
      new InMemoryProofRepository(),
      f.clock,
    );
    const foreignProducer = new DevelopmentSimulatorLoginProofProducer({
      environment: 'development',
      enabled: true,
      simulatorHmacKey: new Uint8Array(32).fill(9),
      identityResolver: { resolveRegisteredIdentityId: () => OTHER },
      proofStore: foreignProofStore,
      clock: f.clock,
    });
    const foreignProof = await foreignProducer.issue(
      Object.freeze({ transport: 'mobile' }),
    );
    const foreignIssuer = new DevelopmentV2SessionIssuer({
      environment: 'development',
      enabled: true,
      proofStore: foreignProofStore,
      accessTokens: f.tokens,
      repository: f.repo,
      clock: f.clock,
    });
    await foreignIssuer.issueFromLoginProof({
      loginProof: foreignProof,
      transportContext: Object.freeze({ transport: 'mobile' }),
    });

    const result = await f.run(caller.accessToken);
    expect(result.response.statusCode).toBe(200);
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(result.headers.get('pragma')).toBe('no-cache');
    expect(result.response.payload).toEqual(
      [
        {
          id: caller.sessionId,
          createdAt: new Date(NOW).toISOString(),
          current: true,
          deviceName: 'Current phone',
        },
        {
          id: web.sessionId,
          createdAt: new Date(NOW).toISOString(),
          current: false,
          deviceName: null,
        },
        {
          id: old.sessionId,
          createdAt: new Date(NOW).toISOString(),
          current: false,
          deviceName: 'Old phone',
        },
      ].sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect(JSON.stringify(result.response.payload)).not.toContain(
      caller.refreshToken,
    );
    expect(JSON.stringify(result.response.payload)).not.toContain('familyId');
  });

  it.each([
    ['cookie', ['Authorization', 'Bearer TOKEN', 'Cookie', 'unrelated=x']],
    [
      'origin',
      ['Authorization', 'Bearer TOKEN', 'Origin', 'https://app.example'],
    ],
    [
      'duplicate authorization',
      ['Authorization', 'Bearer TOKEN', 'Authorization', 'Bearer TOKEN'],
    ],
    ['refresh authorization', ['Authorization', 'Refresh opaque-secret']],
  ])(
    'rejects %s as a credential or browser-mode fallback',
    async (_label, headers) => {
      const f = await fixture();
      const token = await f.mint();
      const raw = headers.map((value) =>
        value === 'Bearer TOKEN' ? `Bearer ${token.accessToken}` : value,
      );
      const result = await f.run(token.accessToken, (request) => {
        Object.defineProperty(request, 'rawHeaders', { value: raw });
      });
      expect(result.response.statusCode).toBe(400);
      expect(result.headers.get('cache-control')).toBe('no-store');
    },
  );

  it('rejects query, body and non-TLS requests before resolving a principal', async () => {
    const resolve = vi.fn((token: string) =>
      Promise.resolve(
        Object.freeze({ identityId: ID, sessionId: token } as never),
      ),
    );
    const f = await fixture({ principal: { resolve } });
    const token = await f.mint();
    for (const [url, body, socket] of [
      ['/v2/me/sessions?limit=1', undefined, new TLSSocket(new Socket())],
      ['/v2/me/sessions', {}, new TLSSocket(new Socket())],
      ['/v2/me/sessions', undefined, new Socket()],
    ] as const) {
      const req = f.makeRequest(
        token.accessToken,
        ['Authorization', `Bearer ${token.accessToken}`],
        url,
        socket as TLSSocket,
      );
      const response = responseFixture();
      await f.service.handle(body, req, response.port);
      expect(response.response.statusCode).toBe(400);
    }
    expect(resolve).not.toHaveBeenCalled();
  });

  it('fails closed when principal resolution is not a native Promise or the listed summaries are malformed', async () => {
    const f = await fixture();
    const token = await f.mint();
    const exotic = {
      resolve: () => ({
        then: (done: (x: unknown) => void) =>
          done({ identityId: ID, sessionId: token.sessionId }),
      }),
    };
    const badResolver = new V2MobileListingHttpService({
      environment: 'development',
      enabled: true,
      accessTokens: f.tokens,
      principal: exotic as never,
      repository: f.repo,
      clock: f.clock,
    });
    let req = f.makeRequest(token.accessToken);
    let response = responseFixture();
    await badResolver.handle(undefined, req, response.port);
    expect(response.response.statusCode).toBe(500);
    const getter = vi.fn(() => token.sessionId);
    const malformed = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(malformed, 'id', { enumerable: true, get: getter });
    const repo = { listForCurrentSession: () => [malformed] };
    const badOutput = new V2MobileListingHttpService({
      environment: 'development',
      enabled: true,
      accessTokens: f.tokens,
      principal: f.principal,
      repository: repo as never,
      clock: f.clock,
    });
    req = f.makeRequest(token.accessToken);
    response = responseFixture();
    await badOutput.handle(undefined, req, response.port);
    expect(response.response.statusCode).toBe(500);
    expect(getter).not.toHaveBeenCalled();
  });

  it('rejects a caller deleted during resolver wait and a token expiring during that wait', async () => {
    vi.spyOn(BankIdSimulator.prototype, 'verify').mockResolvedValue({
      method: 'BANKID',
      name: 'Fixture',
      personnummerHmac: 'a'.repeat(64),
      verifiedAt: new Date(NOW).toISOString(),
    });
    const f = await fixture();
    const token = await f.mint();
    let release!: (value: unknown) => void;
    const pending = new Promise<unknown>((resolve) => {
      release = resolve;
    });
    const resolver = { resolve: () => pending };
    const service = new V2MobileListingHttpService({
      environment: 'development',
      enabled: true,
      accessTokens: f.tokens,
      principal: resolver as never,
      repository: f.repo,
      clock: f.clock,
    });
    const req = f.makeRequest(token.accessToken);
    const response = responseFixture();
    const handling = service.handle(undefined, req, response.port);
    expect(f.repo.markIdentityDeleted(ID, { userId: ID })).toBe(true);
    release(Object.freeze({ identityId: ID, sessionId: token.sessionId }));
    await handling;
    expect(response.response.statusCode).toBe(401);
    const g = await fixture();
    const freshToken = await g.mint();
    let settle!: (value: unknown) => void;
    const wait = new Promise<unknown>((resolve) => {
      settle = resolve;
    });
    const waiting = new V2MobileListingHttpService({
      environment: 'development',
      enabled: true,
      accessTokens: g.tokens,
      principal: { resolve: () => wait } as never,
      repository: g.repo,
      clock: g.clock,
    });
    const req2 = g.makeRequest(freshToken.accessToken);
    const response2 = responseFixture();
    const processing = waiting.handle(undefined, req2, response2.port);
    g.setNow(NOW + 901_000);
    settle(Object.freeze({ identityId: ID, sessionId: freshToken.sessionId }));
    await processing;
    expect(response2.response.statusCode).toBe(401);
  });
});

describe('mobile listing output and fresh authority checks', () => {
  it.each([
    'duplicate',
    'no-current',
    'wrong-current',
    'unsorted',
    'invalid-date',
    'future-date',
    'row-getter',
    'array-getter',
    'extra-field',
    'sparse',
    'long-device',
  ] as const)(
    'rejects %s repository output without publishing summaries',
    async (fault) => {
      const f = await fixture();
      const a = await f.mint();
      const b = await f.mint();
      const good = f.repo.listForCurrentSession(
        a.sessionId,
        { userId: ID },
        NOW,
      )!;
      let rows: unknown = good.map((x) => ({ ...x }));
      let touched = 0;
      const v = rows as Record<string, unknown>[];
      if (fault === 'duplicate') rows = [v[0], v[0]];
      if (fault === 'no-current')
        rows = v.map((x) => ({ ...x, current: false }));
      if (fault === 'wrong-current')
        rows = v.map((x) => ({ ...x, current: x.id === b.sessionId }));
      if (fault === 'unsorted') rows = v.reverse();
      if (fault === 'invalid-date')
        v[0]!.createdAt = '2027-99-99T00:00:00.000Z';
      if (fault === 'future-date')
        v[0]!.createdAt = new Date(NOW + 1).toISOString();
      if (fault === 'row-getter')
        Object.defineProperty(v[0]!, 'id', {
          enumerable: true,
          get() {
            touched++;
            throw new Error('getter');
          },
        });
      if (fault === 'array-getter')
        Object.defineProperty(v, '0', {
          enumerable: true,
          get() {
            touched++;
            throw new Error('getter');
          },
        });
      if (fault === 'extra-field') v[0]!.identityId = ID;
      if (fault === 'sparse') delete v[0];
      if (fault === 'long-device') v[0]!.deviceName = '😀'.repeat(101);
      const service = new V2MobileListingHttpService({
        ...f.config,
        principal: f.principal,
        repository: { listForCurrentSession: () => rows } as never,
      });
      const out = responseFixture();
      await service.handle(undefined, f.makeRequest(a.accessToken), out.port);
      expect(out.response.statusCode).toBe(500);
      expect(touched).toBe(0);
      expect(out.headers.get('set-cookie')).toBeUndefined();
      expect(out.response.payload).not.toEqual(good);
    },
  );
  it('rejects deletion after a real principal has resolved before listing', async () => {
    const f = await fixture();
    const token = await f.mint();
    const resolve = f.principal.resolve.bind(f.principal);
    const service = new V2MobileListingHttpService({
      ...f.config,
      principal: {
        resolve: async (...args: Parameters<typeof resolve>) => {
          const p = await resolve(...args);
          f.repo.markIdentityDeleted(ID, { userId: ID });
          return p;
        },
      },
    });
    const out = responseFixture();
    await service.handle(undefined, f.makeRequest(token.accessToken), out.port);
    expect(out.response.statusCode).toBe(401);
  });
  it('rejects JWT expiry after a real principal has already resolved', async () => {
    const f = await fixture();
    const token = await f.mint();
    const resolve = f.principal.resolve.bind(f.principal);
    const service = new V2MobileListingHttpService({
      ...f.config,
      principal: {
        resolve: async (...args: Parameters<typeof resolve>) => {
          const p = await resolve(...args);
          f.setNow(NOW + 900_000);
          return p;
        },
      },
    });
    const out = responseFixture();
    await service.handle(undefined, f.makeRequest(token.accessToken), out.port);
    expect(out.response.statusCode).toBe(401);
  });
  it.each([
    'nonce',
    'csrf',
    'length',
    'transfer',
    'v1',
    'missing-auth',
  ] as const)('rejects %s before owner listing', async (fault) => {
    const f = await fixture();
    const token = await f.mint();
    const req = f.makeRequest(token.accessToken);
    if (fault === 'nonce') req.rawHeaders.push('X-Browser-Nonce', 'public');
    if (fault === 'csrf') req.rawHeaders.push('X-XSRF-Token', 'token');
    if (fault === 'length') req.rawHeaders.push('Content-Length', '1');
    if (fault === 'transfer')
      req.rawHeaders.push('Transfer-Encoding', 'chunked');
    if (fault === 'v1')
      req.rawHeaders[1] = 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJ2ZXIiOjF9.c2ln';
    if (fault === 'missing-auth') req.rawHeaders.splice(0, 2);
    const out = responseFixture();
    await f.service.handle(undefined, req, out.port);
    expect(out.response.statusCode).toBe(fault === 'v1' ? 401 : 400);
  });
  it('rejects hostile Promise getters without assimilating a thenable', async () => {
    const f = await fixture();
    const token = await f.mint();
    let touched = 0;
    const pending = Promise.resolve({
      identityId: ID,
      sessionId: token.sessionId,
    });
    Object.defineProperty(pending, 'then', {
      get() {
        touched++;
        throw new Error('getter');
      },
    });
    const service = new V2MobileListingHttpService({
      ...f.config,
      principal: { resolve: () => pending } as never,
    });
    const out = responseFixture();
    await service.handle(undefined, f.makeRequest(token.accessToken), out.port);
    expect(out.response.statusCode).toBe(500);
    expect(touched).toBe(0);
  });
});
