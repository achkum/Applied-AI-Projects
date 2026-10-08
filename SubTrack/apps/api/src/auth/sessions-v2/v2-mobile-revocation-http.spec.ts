import { generateKeyPairSync } from 'node:crypto';
import { TLSSocket } from 'node:tls';
import { Socket } from 'node:net';
import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BankIdSimulator } from '../identity-provider/bankid-simulator';
import { DevelopmentSimulatorLoginProofProducer } from '../proofs-v2/bankid-simulator-proof-producer';
import { InMemoryProofRepository, ProofStore } from '../proofs-v2/proof-store';
import { DevelopmentV2PrincipalResolver } from './v2-principal-resolver';
import {
  DevelopmentV2SessionIssuer,
  InMemoryV2SessionRepository,
} from './v2-session-issuer';
import { V2AccessToken } from './v2-access-token';
import { V2MobileRevocationHttpModule } from './v2-mobile-revocation-http.module';
import { V2MobileRevocationHttpService } from './v2-mobile-revocation-http';

const NOW = 1_800_000_000_000;
const ID = '123e4567-e89b-42d3-a456-426614174000';
const OTHER = '123e4567-e89b-42d3-a456-426614174001';
const MOBILE = Object.freeze({ transport: 'mobile' } as const);
const originalVerify = BankIdSimulator.prototype.verify;
const sockets: TLSSocket[] = [];

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
  vi.spyOn(BankIdSimulator.prototype, 'verify').mockResolvedValue({
    method: 'BANKID',
    name: 'Fixture',
    personnummerHmac: 'a'.repeat(64),
    verifiedAt: new Date(NOW).toISOString(),
  });
  const clock = () => now;
  const proofStore = new ProofStore(new InMemoryProofRepository(), clock);
  const pair = generateKeyPairSync('ed25519');
  const accessTokens = new V2AccessToken({
    environment: 'development',
    enabled: true,
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    clock,
  });
  const repository = new InMemoryV2SessionRepository(
    [ID, OTHER],
    100,
    clock,
    maxConsumed,
  );
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
  let owner = ID;
  const producer = new DevelopmentSimulatorLoginProofProducer({
    environment: 'development',
    enabled: true,
    simulatorHmacKey: new Uint8Array(32).fill(9),
    identityResolver: { resolveRegisteredIdentityId: () => owner },
    proofStore,
    clock,
  });
  const issue = async (identity = ID, deviceName = 'Fixture phone') => {
    owner = identity;
    const proof = await producer.issue(MOBILE);
    return issuer.issueFromLoginProof({
      loginProof: proof,
      transportContext: MOBILE,
      deviceName,
    });
  };
  const config = {
    environment: 'development' as const,
    enabled: true as const,
    accessTokens,
    principal,
    repository,
    clock,
  };
  const service = new V2MobileRevocationHttpService(config);
  const makeRequest = (token: string, path: string) => {
    const socket = new TLSSocket(new Socket());
    sockets.push(socket);
    return {
      originalUrl: path,
      rawHeaders: ['Authorization', `Bearer ${token}`],
      socket,
      secure: true,
    } as unknown as Request;
  };
  const run = async (
    caller: string,
    target: string,
    options: { request?: Request; body?: unknown } = {},
    out = responseFixture(),
  ) => {
    await service.handle(
      target,
      options.body,
      options.request ?? makeRequest(caller, `/v2/me/sessions/${target}`),
      out.port,
    );
    return out;
  };
  return {
    accessTokens,
    repository,
    principal,
    issue,
    makeRequest,
    run,
    clock,
    setNow: (value: number) => {
      now = value;
    },
    config,
  };
}

afterEach(() => {
  for (const socket of sockets.splice(0)) socket.destroy();
  BankIdSimulator.prototype.verify = originalVerify;
  vi.restoreAllMocks();
});

describe('development mobile session revocation HTTP trust boundaries', () => {
  it('revokes an owned mobile sibling and preserves its neighbor without CSRF state', async () => {
    const f = await fixture();
    const caller = await f.issue();
    const target = await f.issue();
    const neighbor = await f.issue();
    const result = await f.run(caller.accessToken, target.sessionId);
    expect(result.response.statusCode).toBe(204);
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(result.headers.get('set-cookie')).toBeUndefined();
    expect(result.response.payload).toBeUndefined();
    expect(
      f.repository.readSession(target.sessionId, { userId: ID }, f.clock()),
    ).toBeNull();
    expect(
      f.repository.readSession(neighbor.sessionId, { userId: ID }, f.clock()),
    ).not.toBeNull();
  });

  it('allows self revocation, then rejects the revoked caller token', async () => {
    const f = await fixture();
    const caller = await f.issue();
    expect(
      (await f.run(caller.accessToken, caller.sessionId)).response.statusCode,
    ).toBe(204);
    expect(
      (await f.run(caller.accessToken, caller.sessionId)).response.statusCode,
    ).toBe(401);
  });

  it('hides foreign and absent targets behind the same not-found response', async () => {
    const f = await fixture();
    const caller = await f.issue();
    const foreign = await f.issue(OTHER);
    const missingId = '123e4567-e89b-42d3-a456-426614174099';
    const missing = await f.run(caller.accessToken, missingId);
    const hidden = await f.run(caller.accessToken, foreign.sessionId);
    expect(missing.response.statusCode).toBe(404);
    expect(hidden.response.statusCode).toBe(404);
    expect(hidden.response.payload).toEqual(missing.response.payload);
    expect(
      f.repository.readSession(foreign.sessionId, { userId: OTHER }, NOW),
    ).not.toBeNull();
  });

  it('can revoke a same-owner web sibling while leaving the mobile caller valid', async () => {
    const f = await fixture();
    const caller = await f.issue();
    const webId = '123e4567-e89b-42d3-a456-426614174010';
    expect(
      f.repository.createForActiveIdentity(
        {
          identityId: ID,
          sessionId: webId,
          familyId: '123e4567-e89b-42d3-a456-426614174011',
          generation: 0,
          refreshTokenHash: 'b'.repeat(64),
          transport: 'web',
          deviceName: null,
          createdAt: NOW,
          expiresAt: NOW + 86_400_000,
          exactOrigin: 'https://app.example',
          browserChainId: 'fixture-chain',
        },
        { userId: ID },
      ),
    ).toBe(true);
    expect((await f.run(caller.accessToken, webId)).response.statusCode).toBe(
      204,
    );
    expect(f.repository.readSession(webId, { userId: ID }, NOW)).toBeNull();
    expect(
      f.repository.readSession(caller.sessionId, { userId: ID }, NOW),
    ).not.toBeNull();
  });

  it('preserves caller and target when retained revocation history is at capacity', async () => {
    const f = await fixture(1);
    const caller = await f.issue();
    const first = await f.issue();
    const second = await f.issue();
    expect(
      (await f.run(caller.accessToken, first.sessionId)).response.statusCode,
    ).toBe(204);
    expect(
      (await f.run(caller.accessToken, second.sessionId)).response.statusCode,
    ).toBe(500);
    expect(
      f.repository.readSession(second.sessionId, { userId: ID }, NOW),
    ).not.toBeNull();
    expect(
      f.repository.readSession(caller.sessionId, { userId: ID }, NOW),
    ).not.toBeNull();
  });

  it.each([
    'cookie',
    'origin',
    'nonce',
    'csrf',
    'query',
    'duplicate-authorization',
    'content-length',
    'transfer-encoding',
  ] as const)(
    'rejects %s credentials or framing before mutation',
    async (kind) => {
      const f = await fixture();
      const caller = await f.issue();
      const target = await f.issue();
      const req = f.makeRequest(
        caller.accessToken,
        `/v2/me/sessions/${target.sessionId}`,
      );
      if (kind === 'cookie')
        req.rawHeaders.push('Cookie', 'st_v2_access=credential');
      if (kind === 'origin')
        req.rawHeaders.push('Origin', 'https://app.example');
      if (kind === 'nonce') req.rawHeaders.push('X-Browser-Nonce', 'nonce');
      if (kind === 'csrf') req.rawHeaders.push('X-Session-CSRF', 'csrf');
      if (kind === 'query') req.originalUrl += '?limit=1';
      if (kind === 'duplicate-authorization')
        req.rawHeaders.push('Authorization', `Bearer ${caller.accessToken}`);
      if (kind === 'content-length') req.rawHeaders.push('Content-Length', '1');
      if (kind === 'transfer-encoding')
        req.rawHeaders.push('Transfer-Encoding', 'chunked');
      const result = await f.run(caller.accessToken, target.sessionId, {
        request: req,
      });
      expect(result.response.statusCode).toBe(
        kind === 'duplicate-authorization' ? 400 : 400,
      );
      expect(result.headers.get('cache-control')).toBe('no-store');
      expect(
        f.repository.readSession(target.sessionId, { userId: ID }, NOW),
      ).not.toBeNull();
    },
  );

  it('requires the actual secure direct TLS socket and canonical target UUID', async () => {
    const f = await fixture();
    const caller = await f.issue();
    const target = await f.issue();
    const plain = f.makeRequest(
      caller.accessToken,
      `/v2/me/sessions/${target.sessionId}`,
    );
    Object.defineProperty(plain, 'socket', { value: new Socket() });
    expect(
      (await f.run(caller.accessToken, target.sessionId, { request: plain }))
        .response.statusCode,
    ).toBe(400);
    const badTarget = await f.run(
      caller.accessToken,
      target.sessionId.toUpperCase(),
    );
    expect(badTarget.response.statusCode).toBe(400);
    expect(
      f.repository.readSession(target.sessionId, { userId: ID }, NOW),
    ).not.toBeNull();
  });

  it('rechecks session and JWT lifetime after the genuine principal resolver awaits', async () => {
    const f = await fixture();
    const caller = await f.issue();
    const target = await f.issue();
    const resolve = f.principal.resolve.bind(f.principal);
    const config = {
      ...f.config,
      principal: {
        resolve: async (...args: Parameters<typeof resolve>) => {
          const principal = await resolve(...args);
          f.setNow(NOW + 900_000);
          return principal;
        },
      },
    };
    const service = new V2MobileRevocationHttpService(config);
    const out = responseFixture();
    await service.handle(
      target.sessionId,
      undefined,
      f.makeRequest(caller.accessToken, `/v2/me/sessions/${target.sessionId}`),
      out.port,
    );
    expect(out.response.statusCode).toBe(401);
    expect(
      f.repository.readSession(target.sessionId, { userId: ID }, NOW),
    ).not.toBeNull();
  });

  it('keeps revocation committed when response delivery fails', async () => {
    const f = await fixture();
    const caller = await f.issue();
    const target = await f.issue();
    const out = responseFixture();
    out.response.end.mockImplementation(() => {
      throw new Error('closed');
    });
    expect(
      (await f.run(caller.accessToken, target.sessionId, {}, out)).response
        .statusCode,
    ).toBe(500);
    expect(
      f.repository.readSession(target.sessionId, { userId: ID }, NOW),
    ).toBeNull();
  });
});

describe('mobile revocation collaborator and race faults', () => {
  it('accepts exactly zero Content-Length without a body', async () => {
    const f = await fixture();
    const a = await f.issue();
    const b = await f.issue();
    const req = f.makeRequest(a.accessToken, '/v2/me/sessions/' + b.sessionId);
    req.rawHeaders.push('Content-Length', '0');
    expect(
      (await f.run(a.accessToken, b.sessionId, { request: req })).response
        .statusCode,
    ).toBe(204);
  });
  it.each(['caller-revoked', 'clock-regression'] as const)(
    'rejects %s after a real principal resolves without revoking the target',
    async (fault) => {
      const f = await fixture();
      const a = await f.issue();
      const b = await f.issue();
      const resolve = f.principal.resolve.bind(f.principal);
      const service = new V2MobileRevocationHttpService({
        ...f.config,
        principal: {
          resolve: async (...args: Parameters<typeof resolve>) => {
            const principal = await resolve(...args);
            if (fault === 'caller-revoked')
              f.repository.revokeForCurrentSession(
                a.sessionId,
                a.sessionId,
                { userId: ID },
                NOW,
              );
            else f.setNow(NOW - 1);
            return principal;
          },
        },
      });
      const out = responseFixture();
      await service.handle(
        b.sessionId,
        undefined,
        f.makeRequest(a.accessToken, '/v2/me/sessions/' + b.sessionId),
        out.port,
      );
      expect(out.response.statusCode).toBe(
        fault === 'caller-revoked' ? 401 : 500,
      );
      f.setNow(NOW);
      expect(
        f.repository.readSession(b.sessionId, { userId: ID }, NOW),
      ).not.toBeNull();
    },
  );
  it.each([
    'hostile-promise',
    'principal-getter',
    'row-getter',
    'outcome-getter',
    'unknown-outcome',
  ] as const)(
    'fails closed on %s without invoking getters or guessing cleanup',
    async (fault) => {
      const f = await fixture();
      const a = await f.issue();
      const b = await f.issue();
      let touched = 0;
      const config = { ...f.config };
      const hostile = Object.defineProperty({}, 'identityId', {
        enumerable: true,
        get() {
          touched++;
          throw new Error('getter');
        },
      });
      if (fault === 'hostile-promise') {
        const pending = Promise.resolve({
          identityId: ID,
          sessionId: a.sessionId,
        });
        Object.defineProperty(pending, 'then', {
          get() {
            touched++;
            throw new Error('getter');
          },
        });
        Object.defineProperty(config, 'principal', {
          value: { resolve: () => pending },
        });
      }
      if (fault === 'principal-getter')
        Object.defineProperty(config, 'principal', {
          value: { resolve: async () => hostile },
        });
      if (fault === 'row-getter')
        vi.spyOn(f.repository, 'readSession').mockReturnValue(hostile as never);
      if (fault === 'outcome-getter')
        vi.spyOn(f.repository, 'revokeForCurrentSession').mockReturnValue(
          Object.defineProperty({}, 'kind', {
            enumerable: true,
            get() {
              touched++;
              throw new Error('getter');
            },
          }) as never,
        );
      if (fault === 'unknown-outcome')
        vi.spyOn(f.repository, 'revokeForCurrentSession').mockReturnValue({
          kind: 'surprise',
        } as never);
      const service = new V2MobileRevocationHttpService(config);
      const out = responseFixture();
      await service.handle(
        b.sessionId,
        undefined,
        f.makeRequest(a.accessToken, '/v2/me/sessions/' + b.sessionId),
        out.port,
      );
      expect(out.response.statusCode).toBe(fault === 'row-getter' ? 401 : 500);
      expect(touched).toBe(0);
      vi.restoreAllMocks();
      expect(
        f.repository.readSession(b.sessionId, { userId: ID }, NOW),
      ).not.toBeNull();
    },
  );
  it.each(['extra-web-binding', 'wrong-owner', 'wrong-transport'] as const)(
    'rejects %s current row rather than trusting an earlier principal',
    async (fault) => {
      const f = await fixture();
      const a = await f.issue();
      const b = await f.issue();
      const read = f.repository.readSession.bind(f.repository);
      const service = new V2MobileRevocationHttpService({
        ...f.config,
        repository: {
          revokeForCurrentSession: f.repository.revokeForCurrentSession.bind(
            f.repository,
          ),
          readSession: (...args: Parameters<typeof read>) => {
            const row = read(...args)!;
            return {
              ...row,
              ...(fault === 'extra-web-binding'
                ? { browserChainId: 'foreign' }
                : fault === 'wrong-owner'
                  ? { identityId: OTHER }
                  : { transport: 'web' }),
            } as never;
          },
        },
      });
      const out = responseFixture();
      await service.handle(
        b.sessionId,
        undefined,
        f.makeRequest(a.accessToken, '/v2/me/sessions/' + b.sessionId),
        out.port,
      );
      expect(out.response.statusCode).toBe(401);
      expect(read(b.sessionId, { userId: ID }, NOW)).not.toBeNull();
    },
  );
  it.each(['config-getter', 'method-getter', 'production'] as const)(
    'rejects %s registration without getter evaluation',
    async (fault) => {
      const f = await fixture();
      const config = { ...f.config };
      let touched = 0;
      if (fault === 'config-getter')
        Object.defineProperty(config, 'enabled', {
          enumerable: true,
          get() {
            touched++;
            return true;
          },
        });
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
      expect(() => new V2MobileRevocationHttpService(config)).toThrow();
      expect(() => V2MobileRevocationHttpModule.register(config)).toThrow();
      expect(touched).toBe(0);
    },
  );
});
