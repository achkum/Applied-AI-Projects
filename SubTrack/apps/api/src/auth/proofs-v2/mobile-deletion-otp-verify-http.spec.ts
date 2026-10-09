import { generateKeyPairSync } from 'node:crypto';
import { Socket } from 'node:net';
import { TLSSocket } from 'node:tls';
import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BankIdSimulator } from '../identity-provider/bankid-simulator';
import { InMemoryIdempotencyGuard } from '../idempotency/idempotency-guard';
import { DevelopmentSimulatorLoginProofProducer } from './bankid-simulator-proof-producer';
import { DevelopmentDeletionOtpProofProducer } from './deletion-otp-proof-producer';
import {
  DevelopmentMobileDeletionOtpVerifyHttpService,
  type MobileDeletionOtpVerifyHttpConfig,
} from './mobile-deletion-otp-verify-http';
import { DevelopmentMobileDeletionOtpAuthorityResolver } from './mobile-deletion-otp-authority';
import {
  InMemoryProofRepository,
  ProofStore,
  type StoredProof,
} from './proof-store';
import { DevelopmentV2PrincipalResolver } from '../sessions-v2/v2-principal-resolver';
import {
  DevelopmentV2SessionIssuer,
  InMemoryV2SessionRepository,
} from '../sessions-v2/v2-session-issuer';
import { V2AccessToken } from '../sessions-v2/v2-access-token';

const NOW = 1_800_000_000_000;
const ID = '123e4567-e89b-42d3-a456-426614174000';
const MOBILE = Object.freeze({ transport: 'mobile' as const });
const KEY = new Uint8Array(32).fill(7);
afterEach(() => vi.restoreAllMocks());

async function fixture(channel: 'sms' | 'email' = 'sms') {
  let now = NOW;
  let holdProofInsert = false;
  let proofInsertEntered!: () => void;
  let releaseProofInsert!: () => void;
  const proofInsertStarted = new Promise<void>((resolve) => {
    proofInsertEntered = resolve;
  });
  const proofInsertGate = new Promise<void>((resolve) => {
    releaseProofInsert = resolve;
  });
  const proofRepository = new InMemoryProofRepository();
  const gatedProofRepository = {
    insert: async (record: StoredProof) => {
      if (holdProofInsert) {
        proofInsertEntered();
        await proofInsertGate;
      }
      proofRepository.insert(record);
    },
    compareAndConsume: (
      ...args: Parameters<InMemoryProofRepository['compareAndConsume']>
    ) => proofRepository.compareAndConsume(...args),
    compareAndConsumeLogin: (
      ...args: Parameters<
        NonNullable<InMemoryProofRepository['compareAndConsumeLogin']>
      >
    ) => proofRepository.compareAndConsumeLogin!(...args),
  };
  vi.spyOn(BankIdSimulator.prototype, 'verify').mockResolvedValue({
    method: 'BANKID',
    name: 'Fixture',
    personnummerHmac: 'a'.repeat(64),
    verifiedAt: new Date(NOW).toISOString(),
  });
  const clock = () => now;
  const proofStore = new ProofStore(gatedProofRepository, clock);
  const pair = generateKeyPairSync('ed25519');
  const accessTokens = new V2AccessToken({
    environment: 'development',
    enabled: true,
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    clock,
  });
  const repository = new InMemoryV2SessionRepository([ID], 100, clock);
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
  const simulatorLogin = new DevelopmentSimulatorLoginProofProducer({
    environment: 'development',
    enabled: true,
    simulatorHmacKey: new Uint8Array(32).fill(4),
    identityResolver: { resolveRegisteredIdentityId: () => ID },
    proofStore,
    clock,
  });
  const session = await issuer.issueFromLoginProof({
    loginProof: await simulatorLogin.issue(MOBILE),
    transportContext: MOBILE,
    deviceName: 'Synthetic phone',
  });
  const contacts = {
    readRegisteredContact: async (
      context: Readonly<{ userId: string }>,
      observedAt: number,
    ) =>
      context.userId === ID && observedAt === now
        ? Object.freeze({ identifierHash: 'a'.repeat(64), channel })
        : null,
  };
  const authorityResolver = new DevelopmentMobileDeletionOtpAuthorityResolver({
    environment: 'development',
    enabled: true,
    authDeleteOtpDevOnly: true,
    accessTokens,
    principal,
    repository,
    registeredContacts: contacts,
    clock,
  });
  const otpProofs = new DevelopmentDeletionOtpProofProducer({
    environment: 'development',
    enabled: true,
    authDeleteOtpDevOnly: true,
    key: new Uint8Array(32).fill(8),
    proofStore,
    clock,
  });
  const idempotency = new InMemoryIdempotencyGuard({
    key: new Uint8Array(32).fill(9),
    ttlMs: 60_000,
    clock,
  });
  const privateCodes = new Map<
    string,
    { challengeId: string; code: string; expiresAt: number }
  >();
  const authority = await authorityResolver.resolve(session.accessToken);
  const challenge = otpProofs.start(authority);
  privateCodes.set(challenge.challengeId, challenge);
  const verify = vi.fn(
    (input: Parameters<DevelopmentDeletionOtpProofProducer['verify']>[0]) =>
      otpProofs.verify(input),
  );
  const reserve = vi.fn(
    (input: Parameters<InMemoryIdempotencyGuard['reserve']>[0]) =>
      idempotency.reserve(input),
  );
  const settle = vi.fn(
    (...args: Parameters<InMemoryIdempotencyGuard['settle']>) =>
      idempotency.settle(...args),
  );
  const readSession = vi.fn(
    (...args: Parameters<InMemoryV2SessionRepository['readSession']>) =>
      repository.readSession(...args),
  );
  const config: MobileDeletionOtpVerifyHttpConfig = {
    environment: 'development',
    enabled: true,
    authDeleteOtpDevOnly: true,
    accessTokens,
    principal,
    repository: { readSession },
    registeredContacts: contacts,
    otpProofs: { verify },
    idempotency: { reserve, settle },
    authorityDigestKey: new Uint8Array(KEY),
    clock,
  };
  const service = new DevelopmentMobileDeletionOtpVerifyHttpService(config);
  return {
    service,
    config,
    session,
    repository,
    proofStore,
    proofRepository,
    otpProofs,
    privateCodes,
    verify,
    reserve,
    settle,
    authorityResolver,
    authority,
    clock,
    setNow: (n: number) => {
      now = n;
    },
    holdProofInsert: () => {
      holdProofInsert = true;
    },
    proofInsertStarted,
    releaseProofInsert: () => releaseProofInsert(),
  };
}
function request(
  token: string,
  challengeId: string,
  code: string,
  extras: readonly string[] = [],
  key = 'unit-idempotency-key-0001',
): Request {
  const body = JSON.stringify({ challengeId, code });
  return {
    originalUrl: '/v2/me/reauth/otp/verify',
    rawHeaders: [
      'authorization',
      `Bearer ${token}`,
      'content-type',
      'application/json',
      'content-length',
      String(Buffer.byteLength(body)),
      'idempotency-key',
      key,
      ...extras,
    ],
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(body)),
    },
    secure: true,
    socket: new TLSSocket(new Socket()),
  } as unknown as Request;
}
function response() {
  const result: {
    statusCode: number;
    typeValue?: string;
    body?: unknown;
    headers: Record<string, string>;
    headersSent: boolean;
  } = { statusCode: 200, headers: {}, headersSent: false };
  const port = {
    get headersSent() {
      return result.headersSent;
    },
    setHeader(name: string, value: string) {
      result.headers[name] = value;
      return this;
    },
    status(code: number) {
      result.statusCode = code;
      return this;
    },
    type(value: string) {
      result.typeValue = value;
      return this;
    },
    send(value: unknown) {
      result.body = value;
      result.headersSent = true;
      return this;
    },
  };
  return { result, port: port as unknown as Response };
}

const challengeId = (f: Awaited<ReturnType<typeof fixture>>) =>
  [...f.privateCodes.keys()][0]!;
describe('DevelopmentMobileDeletionOtpVerifyHttpService', () => {
  it('returns only the real account-delete proof for the authenticated mobile principal', async () => {
    const f = await fixture();
    const id = challengeId(f);
    const code = f.privateCodes.get(id)!.code;
    const out = response();
    f.config.authorityDigestKey.fill(0);
    await f.service.handle(
      { challengeId: id, code },
      request(f.session.accessToken, id, code),
      out.port,
    );
    expect(out.result.statusCode).toBe(200);
    expect(out.result.body).toEqual({
      reauthProof: expect.stringMatching(/^v2\.[A-Za-z0-9_-]{43}$/),
    });
    expect(Object.keys(out.result.body as object)).toEqual(['reauthProof']);
    expect(out.result.headers).toEqual({
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    });
    expect(f.settle.mock.calls.at(-1)?.[2]).toBe('completed');
    const proof = (out.result.body as { reauthProof: string }).reauthProof;
    expect(
      await f.proofStore.consume(proof, {
        purpose: 'login',
        challenge: id,
        transport: 'mobile',
        identityId: ID,
        sessionId: f.session.sessionId,
        identifierHash: 'a'.repeat(64),
      }),
    ).toEqual({ valid: false });
    expect(
      await f.proofStore.consume(proof, {
        purpose: 'account-delete',
        challenge: id,
        transport: 'mobile',
        identityId: ID,
        sessionId: f.session.sessionId,
        identifierHash: 'a'.repeat(64),
      }),
    ).toEqual({ valid: true });
  });
  it.each([
    ['malformed id', 'x', '123456'],
    ['non-six-digit code', 'A'.repeat(43), '12345x'],
    ['extra body field', 'A'.repeat(43), '123456'],
  ])('rejects %s before reservation or core use', async (kind, id, code) => {
    const f = await fixture();
    const out = response();
    const body =
      kind === 'extra body field'
        ? { challengeId: id, code, identityId: ID }
        : { challengeId: id, code };
    await f.service.handle(
      body,
      request(f.session.accessToken, id, code),
      out.port,
    );
    expect(out.result.statusCode).toBe(400);
    expect(f.reserve).not.toHaveBeenCalled();
    expect(f.verify).not.toHaveBeenCalled();
  });
  it.each([
    ['cookie', ['Cookie', 'unrelated=1']],
    ['origin', ['Origin', 'https://attacker.example']],
    ['query', []],
  ] as const)(
    'rejects ambiguous %s transport before reservation',
    async (kind, extra) => {
      const f = await fixture();
      const id = challengeId(f);
      const code = f.privateCodes.get(id)!.code;
      const req = request(
        f.session.accessToken,
        id,
        code,
        extra,
        'unit-ambiguous-key-0001',
      );
      if (kind === 'query')
        Object.defineProperty(req, 'originalUrl', {
          value: '/v2/me/reauth/otp/verify?x=1',
        });
      const out = response();
      await f.service.handle({ challengeId: id, code }, req, out.port);
      expect(out.result.statusCode).toBe(400);
      expect(f.reserve).not.toHaveBeenCalled();
    },
  );
  it.each([
    'wrong',
    'unknown',
    'expired',
    'exhausted',
    'wrong principal/scope',
  ] as const)(
    'maps %s challenge failures to indistinguishable 403',
    async (kind) => {
      const f = await fixture();
      let id = challengeId(f);
      let code = f.privateCodes.get(id)!.code;
      if (kind === 'unknown') id = Buffer.alloc(32, 12).toString('base64url');
      if (kind === 'wrong') code = code === '000000' ? '000001' : '000000';
      if (kind === 'expired') f.setNow(NOW + 300_001);
      if (kind === 'exhausted') {
        const authority = await f.authorityResolver.resolve(
          f.session.accessToken,
        );
        for (let i = 0; i < 5; i++)
          await expect(
            f.otpProofs.verify({
              challengeId: id,
              code: code === '000000' ? '000001' : '000000',
              authority,
            }),
          ).rejects.toThrow();
      }
      if (kind === 'wrong principal/scope') {
        const wrongScope = f.otpProofs.start({
          ...f.authority,
          identityId: '223e4567-e89b-42d3-a456-426614174000',
          identifierHash: 'b'.repeat(64),
        } as Parameters<typeof f.otpProofs.start>[0]);
        f.privateCodes.set(wrongScope.challengeId, wrongScope);
        id = wrongScope.challengeId;
        code = wrongScope.code;
      }
      const out = response();
      await f.service.handle(
        { challengeId: id, code },
        request(
          f.session.accessToken,
          id,
          code,
          [],
          `final-${kind.replaceAll(' ', '-').replaceAll('/', '-')}-attempt-key`,
        ),
        out.port,
      );
      expect(out.result.statusCode).toBe(403);
      expect(out.result.body).toEqual({
        type: 'about:blank',
        title: 'Forbidden',
        status: 403,
        code: 'AUTH_REQUEST_UNAVAILABLE',
      });
      expect(JSON.stringify(out.result.body)).not.toContain(code);
      expect(out.result.headers['Cache-Control']).toBe('no-store');
    },
  );
  it('does not replay a committed proof for duplicate or changed-body idempotency retries', async () => {
    const f = await fixture();
    const id = challengeId(f);
    const code = f.privateCodes.get(id)!.code;
    const key = 'unit-same-key-duplicate-001';
    const first = response();
    await f.service.handle(
      { challengeId: id, code },
      request(f.session.accessToken, id, code, [], key),
      first.port,
    );
    const duplicate = response();
    await f.service.handle(
      { challengeId: id, code },
      request(f.session.accessToken, id, code, [], key),
      duplicate.port,
    );
    const changed = response();
    await f.service.handle(
      { challengeId: id, code: '000000' },
      request(f.session.accessToken, id, '000000', [], key),
      changed.port,
    );
    expect(first.result.statusCode).toBe(200);
    expect(duplicate.result.statusCode).toBe(409);
    expect(changed.result.statusCode).toBe(409);
    expect(duplicate.result.body).not.toHaveProperty('reauthProof');
    expect(f.verify).toHaveBeenCalledTimes(1);
  });
  it('allows at most one proof from parallel correct verification requests', async () => {
    const f = await fixture();
    const id = challengeId(f);
    const code = f.privateCodes.get(id)!.code;
    const first = response();
    const second = response();
    await Promise.all([
      f.service.handle(
        { challengeId: id, code },
        request(
          f.session.accessToken,
          id,
          code,
          [],
          'parallel-proof-key-000001',
        ),
        first.port,
      ),
      f.service.handle(
        { challengeId: id, code },
        request(
          f.session.accessToken,
          id,
          code,
          [],
          'parallel-proof-key-000002',
        ),
        second.port,
      ),
    ]);
    expect(
      [first.result, second.result].filter(
        (result) => result.statusCode === 200,
      ),
    ).toHaveLength(1);
    expect(f.verify).toHaveBeenCalledTimes(2);
  });
  it('suppresses the real issued proof after session revocation while proof-store insertion is pending', async () => {
    const f = await fixture();
    const id = challengeId(f);
    const code = f.privateCodes.get(id)!.code;
    f.holdProofInsert();
    const first = response();
    const pending = f.service.handle(
      { challengeId: id, code },
      request(f.session.accessToken, id, code, [], 'parallel-proof-key-000001'),
      first.port,
    );
    await f.proofInsertStarted;
    expect(f.verify).toHaveBeenCalledTimes(1);
    f.repository.revokeForCurrentSession(
      f.session.sessionId,
      f.session.sessionId,
      { userId: ID },
      NOW,
    );
    f.releaseProofInsert();
    await pending;
    expect(first.result.statusCode).toBe(401);
    expect(first.result.body).not.toHaveProperty('reauthProof');
    const second = response();
    await f.service.handle(
      { challengeId: id, code },
      request(f.session.accessToken, id, code, [], 'parallel-proof-key-000002'),
      second.port,
    );
    expect(second.result.statusCode).toBe(401);
    expect(second.result.body).not.toHaveProperty('reauthProof');
    expect(f.reserve).toHaveBeenCalledTimes(1);
    await expect(
      f.otpProofs.verify({ challengeId: id, code, authority: f.authority }),
    ).rejects.toThrow();
  });
  it('does not restore a consumed challenge when proof insertion fails', async () => {
    const f = await fixture();
    const id = challengeId(f);
    const code = f.privateCodes.get(id)!.code;
    f.proofRepository.insert = () => {
      throw new Error('capacity');
    };
    const first = response();
    await f.service.handle(
      { challengeId: id, code },
      request(f.session.accessToken, id, code, [], 'insert-failure-key-00001'),
      first.port,
    );
    const retry = response();
    await f.service.handle(
      { challengeId: id, code },
      request(f.session.accessToken, id, code, [], 'insert-failure-key-00002'),
      retry.port,
    );
    expect(first.result.statusCode).toBe(403);
    expect(retry.result.statusCode).toBe(403);
    expect(first.result.body).not.toHaveProperty('reauthProof');
    expect(retry.result.body).not.toHaveProperty('reauthProof');
    expect(f.verify).toHaveBeenCalledTimes(2);
  });
  it('keeps uncertain settlement outcomes non-replayable', async () => {
    const f = await fixture();
    const id = challengeId(f);
    const code = f.privateCodes.get(id)!.code;
    const key = 's'.repeat(32);
    f.settle.mockImplementation(() => {
      throw new Error('settlement unavailable');
    });
    const first = response();
    await f.service.handle(
      { challengeId: id, code },
      request(f.session.accessToken, id, code, [], key),
      first.port,
    );
    const retry = response();
    await f.service.handle(
      { challengeId: id, code },
      request(f.session.accessToken, id, code, [], key),
      retry.port,
    );
    expect(first.result.statusCode).toBe(500);
    expect(retry.result.statusCode).toBe(409);
    expect(first.result.body).not.toHaveProperty('reauthProof');
    expect(retry.result.body).not.toHaveProperty('reauthProof');
    expect(f.verify).toHaveBeenCalledTimes(1);
  });
  it('fails closed on hostile accessor bodies and non-native core thenables', async () => {
    const f = await fixture();
    const id = challengeId(f);
    const code = f.privateCodes.get(id)!.code;
    const hostile = Object.defineProperties(
      {},
      {
        challengeId: {
          enumerable: true,
          get() {
            throw new Error('getter');
          },
        },
        code: { enumerable: true, value: code },
      },
    );
    const badBody = response();
    await f.service.handle(
      hostile,
      request(f.session.accessToken, id, code),
      badBody.port,
    );
    expect(badBody.result.statusCode).toBe(400);
    expect(f.reserve).not.toHaveBeenCalled();
    const g = await fixture();
    const gid = challengeId(g);
    const gcode = g.privateCodes.get(gid)!.code;
    g.verify.mockImplementation(
      () =>
        ({
          then: (resolve: (value: string) => void) =>
            resolve('v2.' + 'A'.repeat(43)),
        }) as unknown as Promise<string>,
    );
    const out = response();
    await g.service.handle(
      { challengeId: gid, code: gcode },
      request(g.session.accessToken, gid, gcode),
      out.port,
    );
    expect(out.result.statusCode).toBe(500);
    expect(out.result.body).not.toHaveProperty('reauthProof');
  });
  it('captures configuration ports at construction and returns a generic error when response writing fails', async () => {
    const f = await fixture();
    const id = challengeId(f);
    const code = f.privateCodes.get(id)!.code;
    const original = f.verify.getMockImplementation()!;
    const out = response();
    const broken = Object.create(out.port) as Response;
    Object.defineProperty(broken, 'send', {
      value: () => {
        throw new Error('socket');
      },
    });
    await f.service.handle(
      { challengeId: id, code },
      request(f.session.accessToken, id, code),
      broken,
    );
    expect(out.result.body).toBeUndefined();
    expect(f.verify).toHaveBeenCalledTimes(1);
    const retry = response();
    await f.service.handle(
      { challengeId: id, code },
      request(f.session.accessToken, id, code),
      retry.port,
    );
    expect(retry.result.statusCode).toBe(409);
    expect(retry.result.body).not.toHaveProperty('reauthProof');
    expect(
      () =>
        new DevelopmentMobileDeletionOtpVerifyHttpService({
          ...f.config,
          enabled: false,
        } as never),
    ).toThrow();
    expect(original).toBeDefined();
  });
});
