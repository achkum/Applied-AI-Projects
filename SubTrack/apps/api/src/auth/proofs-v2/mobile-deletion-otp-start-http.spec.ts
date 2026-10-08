import { generateKeyPairSync } from 'node:crypto';
import { Socket } from 'node:net';
import { TLSSocket } from 'node:tls';
import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BankIdSimulator } from '../identity-provider/bankid-simulator';
import { InMemoryIdempotencyGuard } from '../idempotency/idempotency-guard';
import { DevelopmentSimulatorLoginProofProducer } from './bankid-simulator-proof-producer';
import {
  DevelopmentDeletionOtpProofProducer,
  DeletionOtpRateLimitError,
} from './deletion-otp-proof-producer';
import { MobileDeletionOtpStartHttpModule } from './mobile-deletion-otp-start-http.module';
import type { MobileDeletionOtpStartHttpConfig } from './mobile-deletion-otp-start-http';
import { InMemoryProofRepository, ProofStore } from './proof-store';
import { DevelopmentMobileDeletionOtpAuthorityResolver } from './mobile-deletion-otp-authority';
import { DevelopmentMobileDeletionOtpStartHttpService } from './mobile-deletion-otp-start-http';
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

async function fixture(
  channel: 'sms' | 'email' = 'sms',
  identities: readonly string[] = [ID],
) {
  let selectedIdentity = ID;
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
  const repository = new InMemoryV2SessionRepository(identities, 100, clock);
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
    identityResolver: { resolveRegisteredIdentityId: () => selectedIdentity },
    proofStore,
    clock,
  });
  const session = await issuer.issueFromLoginProof({
    loginProof: await simulatorLogin.issue(MOBILE),
    transportContext: MOBILE,
    deviceName: 'Test phone',
  });
  const contactRead = vi.fn(
    async (context: Readonly<{ userId: string }>, observedAt: number) => {
      if (!identities.includes(context.userId) || observedAt !== now)
        throw new Error('scope');
      return Object.freeze({ identifierHash: 'a'.repeat(64), channel });
    },
  );
  const contacts = { readRegisteredContact: contactRead };
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
    Readonly<{ challengeId: string; code: string; expiresAt: number }>
  >();
  const start = vi.fn(
    (authority: Parameters<DevelopmentDeletionOtpProofProducer['start']>[0]) =>
      otpProofs.start(authority),
  );
  const reserve = vi.fn(
    (input: Parameters<InMemoryIdempotencyGuard['reserve']>[0]) =>
      idempotency.reserve(input),
  );
  const settle = vi.fn(
    (...args: Parameters<InMemoryIdempotencyGuard['settle']>) =>
      idempotency.settle(...args),
  );
  const sink = vi.fn(
    (
      value: Readonly<{ challengeId: string; code: string; expiresAt: number }>,
    ) => {
      privateCodes.set(value.challengeId, value);
    },
  );
  const readSession = vi.fn(
    (...args: Parameters<InMemoryV2SessionRepository['readSession']>) =>
      repository.readSession(...args),
  );
  const config: MobileDeletionOtpStartHttpConfig = {
    environment: 'development',
    enabled: true,
    authDeleteOtpDevOnly: true,
    accessTokens,
    principal,
    repository: { readSession },
    registeredContacts: contacts,
    otpProofs: { start },
    idempotency: { reserve, settle },
    authorityDigestKey: new Uint8Array(KEY),
    codeSink: { storeCode: sink },
    clock,
  };
  const service = new DevelopmentMobileDeletionOtpStartHttpService(config);
  const issue = async (identity: string) => {
    selectedIdentity = identity;
    return issuer.issueFromLoginProof({
      loginProof: await simulatorLogin.issue(MOBILE),
      transportContext: MOBILE,
      deviceName: 'Synthetic phone',
    });
  };
  return {
    service,
    config,
    session,
    authorityResolver,
    otpProofs,
    proofStore,
    privateCodes,
    repository,
    accessTokens,
    contacts,
    contactRead,
    start,
    reserve,
    settle,
    sink,
    readSession,
    clock,
    issue,
    setNow: (value: number) => {
      now = value;
    },
  };
}

function request(
  token: string,
  channel: 'sms' | 'email' = 'sms',
  extras: readonly string[] = [],
  key = ['test', 'idempotency', 'key', '0001'].join('-'),
): Request {
  const json = JSON.stringify({ channel });
  const rawHeaders = [
    'authorization',
    `Bearer ${token}`,
    'content-type',
    'application/json',
    'content-length',
    String(Buffer.byteLength(json)),
    'idempotency-key',
    key,
    ...extras,
  ];
  return {
    originalUrl: '/v2/me/reauth/otp/start',
    rawHeaders,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(json)),
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
  } = {
    statusCode: 200,
    headers: {},
    headersSent: false,
  };
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

describe('DevelopmentMobileDeletionOtpStartHttpService', () => {
  it('accepts an actual simulator-issued mobile session and returns no private code or proof', async () => {
    const f = await fixture();
    const out = response();
    await f.service.handle(
      { channel: 'sms' },
      request(f.session.accessToken),
      out.port,
    );
    expect(out.result.statusCode).toBe(202);
    expect(out.result.body).toEqual({
      challengeId: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      status: 'accepted',
    });
    expect(Object.keys(out.result.body as object).sort()).toEqual([
      'challengeId',
      'status',
    ]);
    expect(out.result.typeValue).toBe('application/json');
    expect(out.result.headers['Cache-Control']).toBe('no-store');
    expect(out.result.headers['Pragma']).toBe('no-cache');
    expect(JSON.stringify(out.result.body)).not.toContain('code');
    expect(JSON.stringify(out.result.body)).not.toContain('proof');
    expect(f.privateCodes.size).toBe(1);

    const challengeId = (out.result.body as { challengeId: string })
      .challengeId;
    const privateCode = f.privateCodes.get(challengeId)!;
    const authority = await f.authorityResolver.resolve(f.session.accessToken);
    const secret = await f.otpProofs.verify({
      challengeId,
      code: privateCode.code,
      authority,
    });
    expect(
      await f.proofStore.consume(secret, {
        purpose: 'login',
        challenge: challengeId,
        transport: 'mobile',
        identityId: ID,
        sessionId: f.session.sessionId,
        identifierHash: 'a'.repeat(64),
      }),
    ).toEqual({ valid: false });
    expect(
      await f.proofStore.consume(secret, {
        purpose: 'account-delete',
        challenge: challengeId,
        transport: 'mobile',
        identityId: ID,
        sessionId: f.session.sessionId,
        identifierHash: 'a'.repeat(64),
      }),
    ).toEqual({ valid: true });
  });

  it('rejects a channel mismatch before idempotency reservation, quota, challenge, or private sink', async () => {
    const f = await fixture('email');
    const { reserve, start, sink } = f;
    const out = response();
    await f.service.handle(
      { channel: 'sms' },
      request(f.session.accessToken),
      out.port,
    );
    expect(out.result.statusCode).toBe(403);
    expect(reserve).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    expect(sink).not.toHaveBeenCalled();
  });

  it('rejects cookie credentials and noncanonical raw header ambiguity before unsafe work', async () => {
    const f = await fixture();
    const cases = [
      ['cookie', 'unrelated=1'],
      ['content-length', '017'],
      ['transfer-encoding', 'chunked'],
      ['origin', 'https://attacker.example'],
    ] as const;
    for (const extra of cases) {
      const out = response();
      await f.service.handle(
        { channel: 'sms' },
        request(f.session.accessToken, 'sms', extra),
        out.port,
      );
      expect(out.result.statusCode).toBe(400);
      expect(f.privateCodes.size).toBe(0);
    }
  });

  it('accepts ordinary user-agent headers and semantically valid JSON whitespace', async () => {
    const f = await fixture();
    const req = request(f.session.accessToken, 'sms', [
      'User-Agent',
      'Synthetic HTTPS client',
    ]);
    const at = req.rawHeaders.indexOf('content-length');
    req.rawHeaders[at + 1] = String(Buffer.byteLength('{ "channel" : "sms" }'));
    const out = response();
    await f.service.handle({ channel: 'sms' }, req, out.port);
    expect(out.result.statusCode).toBe(202);
  });

  it.each([
    ['extra identity', { channel: 'sms', identityId: ID }],
    ['missing channel', {}],
    ['unknown channel', { channel: 'other' }],
    ['array body', [{ channel: 'sms' }]],
    ['null body', null],
  ])('rejects %s before authority lookup or mutations', async (_name, body) => {
    const f = await fixture();
    const out = response();
    await f.service.handle(body, request(f.session.accessToken), out.port);
    expect(out.result.statusCode).toBe(400);
    expect(f.contactRead).not.toHaveBeenCalled();
    expect(f.reserve).not.toHaveBeenCalled();
    expect(f.start).not.toHaveBeenCalled();
    expect(f.sink).not.toHaveBeenCalled();
  });

  it.each([
    ['Cookie', 'unrelated=1'],
    ['Origin', 'https://app.example'],
    ['X-Session-CSRF', 'x'],
    ['X-Browser-Nonce', 'x'],
    ['X-User-Id', ID],
    ['X-Household-Id', ID],
    ['Content-Length', '0'],
    ['Content-Length', '019'],
    ['Transfer-Encoding', 'chunked'],
    ['Authorization', 'Basic abc'],
    ['Idempotency-Key', 'duplicate-key-value-1234'],
  ])('rejects raw %s ambiguity before mutations', async (name, value) => {
    const f = await fixture();
    const out = response();
    await f.service.handle(
      { channel: 'sms' },
      request(f.session.accessToken, 'sms', [name, value]),
      out.port,
    );
    expect(out.result.statusCode).toBe(400);
    expect(f.reserve).not.toHaveBeenCalled();
    expect(f.start).not.toHaveBeenCalled();
  });

  it('rejects non-TLS transport and missing idempotency keys before mutation', async () => {
    const f = await fixture();
    for (const kind of ['tls', 'key']) {
      const req = request(f.session.accessToken);
      if (kind === 'tls')
        Object.defineProperty(req, 'secure', { value: false });
      else req.rawHeaders.splice(req.rawHeaders.indexOf('idempotency-key'), 2);
      const out = response();
      await f.service.handle({ channel: 'sms' }, req, out.port);
      expect(out.result.statusCode).toBe(400);
    }
    expect(f.reserve).not.toHaveBeenCalled();
    expect(f.start).not.toHaveBeenCalled();
  });

  it('counts duplicate retries in the HTTP throttle, never replays, and expires rolling quota', async () => {
    const f = await fixture();
    const outcomes: number[] = [];
    for (let i = 0; i < 6; i++) {
      const out = response();
      await f.service.handle(
        { channel: 'sms' },
        request(f.session.accessToken),
        out.port,
      );
      outcomes.push(out.result.statusCode);
    }
    expect(outcomes).toEqual([202, 409, 409, 409, 409, 429]);
    expect(f.start).toHaveBeenCalledTimes(1);
    expect(f.reserve).toHaveBeenCalledTimes(5);
    f.setNow(NOW + 60_000);
    const out = response();
    await f.service.handle(
      { channel: 'sms' },
      request(
        f.session.accessToken,
        'sms',
        [],
        'test-rolling-window-fresh-key',
      ),
      out.port,
    );
    expect(out.result.statusCode).toBe(202);
    expect(f.privateCodes.size).toBe(2);
  });

  it('bounds the global HTTP quota across independently issued current mobile principals', async () => {
    const ids = Array.from(
      { length: 61 },
      (_, i) => `123e4567-e89b-42d3-a456-${(426614174000 + i).toString()}`,
    );
    const f = await fixture('sms', ids);
    for (let actor = 0; actor < 60; actor++) {
      const session = actor === 0 ? f.session : await f.issue(ids[actor]!);
      for (let attempt = 0; attempt < 5; attempt++) {
        const out = response();
        await f.service.handle(
          { channel: 'sms' },
          request(
            session.accessToken,
            'sms',
            [],
            `global-request-${actor}-${attempt}-unique-key`,
          ),
          out.port,
        );
        expect(out.result.statusCode).toBe(202);
      }
    }
    const session = await f.issue(ids[60]!);
    const out = response();
    await f.service.handle(
      { channel: 'sms' },
      request(session.accessToken, 'sms', [], 'global-request-301-unique-key'),
      out.port,
    );
    expect(out.result.statusCode).toBe(429);
    expect(f.reserve).toHaveBeenCalledTimes(300);
    expect(f.privateCodes.size).toBe(300);
  });

  it('maps genuine core quota to429 and rejects imitations and challenge capacity generically', async () => {
    const f = await fixture();
    const authority = await f.authorityResolver.resolve(f.session.accessToken);
    for (let i = 0; i < 5; i++) f.otpProofs.start(authority);
    const quota = response();
    await f.service.handle(
      { channel: 'sms' },
      request(f.session.accessToken),
      quota.port,
    );
    expect(quota.result.statusCode).toBe(429);
    expect(f.sink).not.toHaveBeenCalled();
    const g = await fixture();
    g.start.mockImplementation(() => {
      throw new DeletionOtpRateLimitError();
    });
    const fake = response();
    await g.service.handle(
      { channel: 'sms' },
      request(g.session.accessToken),
      fake.port,
    );
    expect(fake.result.statusCode).toBe(500);
    const h = await fixture();
    const core = new DevelopmentDeletionOtpProofProducer({
      environment: 'development',
      enabled: true,
      authDeleteOtpDevOnly: true,
      key: KEY,
      proofStore: h.proofStore,
      clock: h.clock,
      maxChallenges: 1,
    });
    core.start(await h.authorityResolver.resolve(h.session.accessToken));
    h.start.mockImplementation((a) => core.start(a));
    const capacity = response();
    await h.service.handle(
      { channel: 'sms' },
      request(h.session.accessToken),
      capacity.port,
    );
    expect(capacity.result.statusCode).toBe(500);
    expect(h.sink).not.toHaveBeenCalled();
  });

  it.each(['revoke', 'delete', 'expire'] as const)(
    'denies %s after an already-resolved contact await',
    async (kind) => {
      const f = await fixture();
      const original = f.contactRead.getMockImplementation()!;
      f.contactRead.mockImplementation((...args) => {
        const pending = original(...args);
        if (kind === 'revoke')
          f.repository.revokeForCurrentSession(
            f.session.sessionId,
            f.session.sessionId,
            { userId: ID },
            NOW,
          );
        if (kind === 'delete')
          f.repository.markIdentityDeleted(ID, { userId: ID });
        if (kind === 'expire') f.setNow(NOW + 900_000);
        return pending;
      });
      const out = response();
      await f.service.handle(
        { channel: 'sms' },
        request(f.session.accessToken),
        out.port,
      );
      expect(out.result.statusCode).toBe(401);
      expect(f.reserve).not.toHaveBeenCalled();
      expect(f.start).not.toHaveBeenCalled();
    },
  );

  it.each(['reserve', 'start', 'sink', 'settle'] as const)(
    'rechecks current ownership immediately after %s and never continues unsafe effects',
    async (point) => {
      const f = await fixture();
      const revoke = () =>
        f.repository.revokeForCurrentSession(
          f.session.sessionId,
          f.session.sessionId,
          { userId: ID },
          NOW,
        );
      if (point === 'reserve') {
        const original = f.reserve.getMockImplementation()!;
        f.reserve.mockImplementation((input) => {
          const owner = original(input);
          revoke();
          return owner;
        });
      }
      if (point === 'start') {
        const original = f.start.getMockImplementation()!;
        f.start.mockImplementation((input) => {
          const result = original(input);
          revoke();
          return result;
        });
      }
      if (point === 'sink') {
        const original = f.sink.getMockImplementation()!;
        f.sink.mockImplementation((value) => {
          original(value);
          revoke();
        });
      }
      if (point === 'settle') {
        const original = f.settle.getMockImplementation()!;
        f.settle.mockImplementation((...args) => {
          original(...args);
          revoke();
        });
      }
      const out = response();
      await f.service.handle(
        { channel: 'sms' },
        request(f.session.accessToken),
        out.port,
      );
      expect(out.result.statusCode).toBe(401);
      if (point === 'reserve') expect(f.start).not.toHaveBeenCalled();
      if (point === 'reserve' || point === 'start')
        expect(f.sink).not.toHaveBeenCalled();
      if (point === 'settle') {
        expect(f.settle).toHaveBeenCalledTimes(1);
        expect(f.settle.mock.calls[0]?.[2]).toBe('completed');
        expect(out.result.body).not.toHaveProperty('challengeId');
      } else {
        expect(f.settle).not.toHaveBeenCalled();
      }
    },
  );

  it('does not restore a challenge after sink/settle/response failure or replay its result', async () => {
    const f = await fixture();
    f.sink.mockImplementation(() => {
      throw new Error('private sink unavailable');
    });
    const out = response();
    await f.service.handle(
      { channel: 'sms' },
      request(f.session.accessToken),
      out.port,
    );
    expect(out.result.statusCode).toBe(500);
    expect(f.start).toHaveBeenCalledTimes(1);
    expect(f.settle.mock.calls.at(-1)?.[2]).toBe('failed');
    const retry = response();
    await f.service.handle(
      { channel: 'sms' },
      request(f.session.accessToken),
      retry.port,
    );
    expect(retry.result.statusCode).toBe(409);
    expect(f.start).toHaveBeenCalledTimes(1);
    const g = await fixture();
    g.settle.mockImplementation(() => {
      throw new Error('settle unavailable');
    });
    const settlement = response();
    await g.service.handle(
      { channel: 'sms' },
      request(g.session.accessToken),
      settlement.port,
    );
    expect(settlement.result.statusCode).toBe(500);
    expect(g.privateCodes.size).toBe(1);
    expect(g.start).toHaveBeenCalledTimes(1);
    const h = await fixture();
    const responseFailure = response();
    let sends = 0;
    responseFailure.port.send = (() => {
      sends++;
      responseFailure.result.headersSent = true;
      throw new Error('uncertain response');
    }) as Response['send'];
    await expect(
      h.service.handle(
        { channel: 'sms' },
        request(h.session.accessToken),
        responseFailure.port,
      ),
    ).resolves.toBeUndefined();
    expect(sends).toBe(1);
    expect(h.settle.mock.calls.at(-1)?.[2]).toBe('completed');
    expect(h.privateCodes.size).toBe(1);
  });

  it('rejects malformed reservation results and unexpected reserve faults with generic500', async () => {
    const f = await fixture();
    f.reserve.mockImplementation(() => ({
      ownerHandle: 'invalid',
      expiresAt: NOW + 60_000,
    }));
    const out = response();
    await f.service.handle(
      { channel: 'sms' },
      request(f.session.accessToken),
      out.port,
    );
    expect(out.result.statusCode).toBe(500);
    expect(f.start).not.toHaveBeenCalled();
    const g = await fixture();
    g.reserve.mockImplementation(() => {
      throw new Error('unexpected reservation port error');
    });
    const failed = response();
    await g.service.handle(
      { channel: 'sms' },
      request(g.session.accessToken),
      failed.port,
    );
    expect(failed.result.statusCode).toBe(500);
    expect(g.start).not.toHaveBeenCalled();
  });

  it('captures ports and key bytes at registration without invoking getters', async () => {
    const f = await fixture();
    let touches = 0;
    const typedKey = new Uint8Array(32).fill(7);
    Object.defineProperty(typedKey, 'byteLength', {
      get() {
        touches++;
        throw new Error('key getter');
      },
    });
    const config = { ...f.config, authorityDigestKey: typedKey };
    const module = MobileDeletionOtpStartHttpModule.register(config);
    typedKey.fill(0);
    (config.otpProofs as { start: unknown }).start = () => {
      throw new Error('replaced port');
    };
    const providers = module.providers! as {
      provide: unknown;
      useValue?: MobileDeletionOtpStartHttpConfig;
    }[];
    const captured = providers.find((p) =>
      Object.hasOwn(p, 'useValue'),
    )!.useValue!;
    const service = new DevelopmentMobileDeletionOtpStartHttpService(captured);
    const out = response();
    await service.handle(
      { channel: 'sms' },
      request(f.session.accessToken),
      out.port,
    );
    expect(out.result.statusCode).toBe(202);
    expect(touches).toBe(0);
    const getter = Object.defineProperty({}, 'start', {
      get() {
        touches++;
        return () => {};
      },
    });
    expect(() =>
      MobileDeletionOtpStartHttpModule.register({
        ...f.config,
        otpProofs: getter,
      } as never),
    ).toThrow();
    expect(touches).toBe(0);
  });
});
