import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpsRequest } from 'node:https';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { appModuleFor } from '../src/app.module';
import { validateConfig } from '../src/config';
import { PrismaService } from '../src/database/prisma.service';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { BankIdSimulator } from '../src/auth/identity-provider/bankid-simulator';
import { InMemoryIdempotencyGuard } from '../src/auth/idempotency/idempotency-guard';
import { DevelopmentSimulatorLoginProofProducer } from '../src/auth/proofs-v2/bankid-simulator-proof-producer';
import { DevelopmentDeletionOtpProofProducer } from '../src/auth/proofs-v2/deletion-otp-proof-producer';
import { MobileDeletionOtpVerifyHttpModule } from '../src/auth/proofs-v2/mobile-deletion-otp-verify-http.module';
import type { MobileDeletionOtpVerifyHttpConfig } from '../src/auth/proofs-v2/mobile-deletion-otp-verify-http';
import {
  InMemoryProofRepository,
  ProofStore,
  type StoredProof,
} from '../src/auth/proofs-v2/proof-store';
import { DevelopmentMobileDeletionOtpAuthorityResolver } from '../src/auth/proofs-v2/mobile-deletion-otp-authority';
import { DevelopmentV2PrincipalResolver } from '../src/auth/sessions-v2/v2-principal-resolver';
import {
  DevelopmentV2SessionIssuer,
  InMemoryV2SessionRepository,
} from '../src/auth/sessions-v2/v2-session-issuer';
import { V2AccessToken } from '../src/auth/sessions-v2/v2-access-token';

const ID = '123e4567-e89b-42d3-a456-426614174000';
let NOW = Date.now();
const MOBILE = Object.freeze({ transport: 'mobile' } as const);
const CONTACT_HASH = 'b'.repeat(64);
let app: INestApplication;
let port = 0;
let certDir = '';
let ca: Buffer;
let callerToken = '';
let sessionId = '';
let accessTokens: V2AccessToken;
let proofStore: ProofStore;
let repository: InMemoryV2SessionRepository;
let issuer: DevelopmentV2SessionIssuer;
let simulatorLogin: DevelopmentSimulatorLoginProofProducer;
let resolver: DevelopmentMobileDeletionOtpAuthorityResolver;
let contactHook: (() => Promise<void>) | undefined;
let proofInsertHook: (() => Promise<void>) | undefined;
let verifyCalls = 0;
let deletionProducer: DevelopmentDeletionOtpProofProducer;
let idempotency: InMemoryIdempotencyGuard;
let moduleConfig: MobileDeletionOtpVerifyHttpConfig;
let issueChallenge: () => Promise<{
  challengeId: string;
  code: string;
  expiresAt: number;
}>;
const privateCodes = new Map<
  string,
  { challengeId: string; code: string; expiresAt: number }
>();
const originalVerify = BankIdSimulator.prototype.verify;
type Wire = {
  status: number;
  headers: IncomingMessage['headers'];
  body: string;
};
type SendOptions = {
  requestPort?: number;
  token?: string;
  path?: string;
  headers?: Record<string, string | string[]>;
  body?: string;
};
function send(options: SendOptions = {}): Promise<Wire> {
  return new Promise((resolve, reject) => {
    const body =
      options.body ??
      JSON.stringify({
        challengeId: [...privateCodes.keys()].at(-1),
        code: [...privateCodes.values()].at(-1)?.code,
      });
    const headers: Record<string, string | string[]> = {
      Authorization: `Bearer ${options.token ?? callerToken}`,
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(body)),
      'Idempotency-Key': 'w'.repeat(32),
      ...(options.headers ?? {}),
    };
    const request = httpsRequest(
      {
        hostname: 'localhost',
        family: 4,
        port: options.requestPort ?? port,
        path: options.path ?? '/v2/me/reauth/otp/verify',
        method: 'POST',
        ca,
        headers,
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          data += chunk;
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: data,
          }),
        );
      },
    );
    request.on('error', reject);
    request.end(body);
  });
}
function key(value: string): Record<string, string> {
  return { 'Idempotency-Key': value };
}

beforeAll(async () => {
  BankIdSimulator.prototype.verify = async () => ({
    method: 'BANKID',
    name: 'ST203 fixture',
    personnummerHmac: 'a'.repeat(64),
    verifiedAt: new Date(NOW).toISOString(),
  });
  certDir = mkdtempSync(join(tmpdir(), 'subtrack-st203-https-'));
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      join(certDir, 'key.pem'),
      '-out',
      join(certDir, 'cert.pem'),
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost,IP:127.0.0.1',
    ],
    { stdio: 'ignore' },
  );
  ca = readFileSync(join(certDir, 'cert.pem'));
  const clock = () => NOW;
  const proofRepository = new InMemoryProofRepository();
  proofStore = new ProofStore(
    {
      insert: async (record: StoredProof) => {
        if (record.purpose === 'account-delete' && proofInsertHook)
          await proofInsertHook();
        proofRepository.insert(record);
      },
      compareAndConsume: (
        ...args: Parameters<InMemoryProofRepository['compareAndConsume']>
      ) => proofRepository.compareAndConsume(...args),
      compareAndConsumeLogin: (
        ...args: Parameters<InMemoryProofRepository['compareAndConsumeLogin']>
      ) => proofRepository.compareAndConsumeLogin(...args),
    },
    clock,
  );
  const pair = generateKeyPairSync('ed25519');
  accessTokens = new V2AccessToken({
    environment: 'development',
    enabled: true,
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    clock,
  });
  repository = new InMemoryV2SessionRepository([ID], 100, clock);
  issuer = new DevelopmentV2SessionIssuer({
    environment: 'development',
    enabled: true,
    proofStore,
    accessTokens,
    repository,
    clock,
  });
  simulatorLogin = new DevelopmentSimulatorLoginProofProducer({
    environment: 'development',
    enabled: true,
    simulatorHmacKey: new Uint8Array(32).fill(9),
    identityResolver: { resolveRegisteredIdentityId: () => ID },
    proofStore,
    clock,
  });
  const session = await issuer.issueFromLoginProof({
    loginProof: await simulatorLogin.issue(MOBILE),
    transportContext: MOBILE,
    deviceName: 'ST203 HTTPS fixture',
  });
  callerToken = session.accessToken;
  sessionId = session.sessionId;
  const principal = new DevelopmentV2PrincipalResolver({
    environment: 'development',
    enabled: true,
    accessTokens,
    reader: repository,
    clock,
  });
  const registeredContacts = {
    readRegisteredContact: async (context: Readonly<{ userId: string }>) => {
      if (contactHook) await contactHook();
      return context.userId === ID
        ? Object.freeze({
            identifierHash: CONTACT_HASH,
            channel: 'sms' as const,
          })
        : null;
    },
  };
  deletionProducer = new DevelopmentDeletionOtpProofProducer({
    environment: 'development',
    enabled: true,
    authDeleteOtpDevOnly: true,
    key: new Uint8Array(32).fill(8),
    proofStore,
    clock,
  });
  resolver = new DevelopmentMobileDeletionOtpAuthorityResolver({
    environment: 'development',
    enabled: true,
    authDeleteOtpDevOnly: true,
    accessTokens,
    principal,
    repository,
    registeredContacts,
    clock,
  });
  issueChallenge = async () => {
    const trusted = await resolver.resolve(callerToken);
    const value = deletionProducer.start(trusted);
    privateCodes.set(value.challengeId, value);
    return value;
  };
  await issueChallenge();
  idempotency = new InMemoryIdempotencyGuard({
    key: new Uint8Array(32).fill(8),
    ttlMs: 60_000,
    clock,
  });
  moduleConfig = {
    environment: 'development',
    enabled: true,
    authDeleteOtpDevOnly: true,
    accessTokens,
    principal,
    repository,
    registeredContacts,
    otpProofs: {
      verify: (
        input: Parameters<DevelopmentDeletionOtpProofProducer['verify']>[0],
      ) => {
        verifyCalls += 1;
        return deletionProducer.verify(input);
      },
    },
    idempotency,
    authorityDigestKey: new Uint8Array(32).fill(6),
    clock,
  };
  @Module({
    imports: [MobileDeletionOtpVerifyHttpModule.register(moduleConfig)],
  })
  class VerifyFixtureModule {}
  app = await NestFactory.create(VerifyFixtureModule, {
    httpsOptions: { cert: ca, key: readFileSync(join(certDir, 'key.pem')) },
    logger: false,
  });
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  if (!address || typeof address !== 'object')
    throw new Error('HTTPS server did not bind');
  port = address.port;
});
afterAll(async () => {
  await app?.close();
  if (certDir) rmSync(certDir, { recursive: true, force: true });
  BankIdSimulator.prototype.verify = originalVerify;
  vi.restoreAllMocks();
});

describe('ST-203 mobile deletion OTP verify over local CA HTTPS', () => {
  beforeEach(async () => {
    contactHook = undefined;
    proofInsertHook = undefined;
    verifyCalls = 0;
    NOW += 61_000;
    const session = await issuer.issueFromLoginProof({
      loginProof: await simulatorLogin.issue(MOBILE),
      transportContext: MOBILE,
    });
    callerToken = session.accessToken;
    sessionId = session.sessionId;
  });
  it('returns the exact no-store deletion-only proof response and never sets cookies', async () => {
    const challenge = await issueChallenge();
    const result = await send({
      headers: key('st203-verify-success-key-0001'),
    });
    expect(result.status).toBe(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers.pragma).toBe('no-cache');
    expect(result.headers['set-cookie']).toBeUndefined();
    const body: unknown = JSON.parse(result.body);
    expect(body).toEqual({
      reauthProof: expect.stringMatching(/^v2\.[A-Za-z0-9_-]{43}$/),
    });
    expect(Object.keys(body as object)).toEqual(['reauthProof']);
    const secret = (body as { reauthProof: string }).reauthProof;
    expect(
      await proofStore.consume(secret, {
        purpose: 'login',
        challenge: challenge.challengeId,
        transport: 'mobile',
        identityId: ID,
        sessionId,
        identifierHash: CONTACT_HASH,
      }),
    ).toEqual({ valid: false });
    expect(
      await proofStore.consume(secret, {
        purpose: 'account-delete',
        challenge: challenge.challengeId,
        transport: 'mobile',
        identityId: ID,
        sessionId,
        identifierHash: CONTACT_HASH,
      }),
    ).toEqual({ valid: true });
  });
  it('collapses wrong, unknown, and expired challenges to the same 403', async () => {
    const challenge = await issueChallenge();
    const wrongCode = String((Number(challenge.code) + 1) % 1_000_000).padStart(
      6,
      '0',
    );
    const wrong = await send({
      body: JSON.stringify({
        challengeId: challenge.challengeId,
        code: wrongCode,
      }),
      headers: key('st203-wrong-code-key-000001'),
    });
    const unknownId = randomBytes(32).toString('base64url');
    const unknown = await send({
      body: JSON.stringify({ challengeId: unknownId, code: challenge.code }),
      headers: key('st203-unknown-code-key-00001'),
    });
    NOW += 6 * 60_000;
    callerToken = accessTokens.issue(ID, sessionId);
    const expired = await send({
      body: JSON.stringify({
        challengeId: challenge.challengeId,
        code: challenge.code,
      }),
      headers: key('st203-expired-code-key-0001'),
    });
    expect([wrong.status, unknown.status, expired.status]).toEqual([
      403, 403, 403,
    ]);
    expect(new Set([wrong.body, unknown.body, expired.body]).size).toBe(1);
    for (const result of [wrong, unknown, expired]) {
      expect(result.headers['cache-control']).toBe('no-store');
      expect(result.body).not.toContain('reauthProof');
    }
  });
  it('allows at most one proof when two HTTPS requests race to verify one challenge', async () => {
    const challenge = await issueChallenge();
    const body = JSON.stringify({
      challengeId: challenge.challengeId,
      code: challenge.code,
    });
    const [left, right] = await Promise.all([
      send({ body, headers: key('st203-concurrent-a-key-0001') }),
      send({ body, headers: key('st203-concurrent-b-key-0001') }),
    ]);
    expect(
      [left.status, right.status].filter((status) => status === 200),
    ).toHaveLength(1);
    expect([left.status, right.status].sort()).toEqual([200, 403]);
    expect(
      [left, right]
        .filter((result) => result.status !== 200)
        .every((result) => !result.body.includes('reauthProof')),
    ).toBe(true);
  });
  it('uses one-use non-replay semantics for duplicate and changed-body retries', async () => {
    const challenge = await issueChallenge();
    const id = challenge.challengeId;
    const code = challenge.code;
    const idem = 'st203-verify-replay-key-00001';
    const first = await send({
      body: JSON.stringify({ challengeId: id, code }),
      headers: key(idem),
    });
    const duplicate = await send({
      body: JSON.stringify({ challengeId: id, code }),
      headers: key(idem),
    });
    const changed = await send({
      body: JSON.stringify({ challengeId: id, code: '000000' }),
      headers: key(idem),
    });
    expect(first.status).toBe(200);
    expect(duplicate.status).toBe(409);
    expect(changed.status).toBe(409);
    expect(duplicate.body).not.toContain('reauthProof');
    expect(changed.body).not.toContain('reauthProof');
  });
  it.each([
    [
      'extra body property',
      JSON.stringify({
        challengeId: 'A'.repeat(43),
        code: '123456',
        identityId: ID,
      }),
      {},
    ],
    [
      'cookie',
      JSON.stringify({ challengeId: 'A'.repeat(43), code: '123456' }),
      { Cookie: 'unrelated=1' },
    ],
    [
      'origin',
      JSON.stringify({ challengeId: 'A'.repeat(43), code: '123456' }),
      { Origin: 'https://attacker.example' },
    ],
  ])(
    'rejects %s on the wire with a generic no-store error',
    async (_label, body, headers) => {
      const result = await send({
        body,
        headers: {
          ...headers,
          'Idempotency-Key': `st203-wire-negative-${String(_label).replaceAll(' ', '-')}`,
        },
      });
      expect(result.status).toBe(400);
      expect(result.headers['cache-control']).toBe('no-store');
      expect(result.headers.pragma).toBe('no-cache');
      expect(result.body).not.toContain('reauthProof');
    },
  );
  it('returns no-store generic parser errors for malformed JSON', async () => {
    const result = await send({
      body: '{',
      headers: key('st203-parser-error-key-0001'),
    });
    expect(result.status).toBe(400);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers.pragma).toBe('no-cache');
    expect(result.body).not.toContain('SyntaxError');
  });
  it('rejects duplicate Bearer headers and query strings before proof verification', async () => {
    const challenge = await issueChallenge();
    const body = JSON.stringify({
      challengeId: challenge.challengeId,
      code: challenge.code,
    });
    const duplicateBearer = await send({
      body,
      headers: {
        Authorization: [`Bearer ${callerToken}`, `Bearer ${callerToken}`],
        ...key('st203-duplicate-bearer-0001'),
      },
    });
    const query = await send({
      body,
      path: '/v2/me/reauth/otp/verify?source=untrusted',
      headers: key('st203-query-wire-key-000001'),
    });
    expect([duplicateBearer.status, query.status]).toEqual([400, 400]);
    expect(duplicateBearer.body).not.toContain('reauthProof');
    expect(query.body).not.toContain('reauthProof');
    const validRetry = await send({
      body,
      headers: key('st203-after-wire-reject-key-001'),
    });
    expect(validRetry.status).toBe(200);
  });
  it('keeps development configuration opt-in and rejects disabled gates', () => {
    expect(() =>
      MobileDeletionOtpVerifyHttpModule.register({
        ...moduleConfig,
        enabled: false,
      } as never),
    ).toThrow();
    expect(() =>
      MobileDeletionOtpVerifyHttpModule.register({
        ...moduleConfig,
        authDeleteOtpDevOnly: false,
      } as never),
    ).toThrow();
    expect(moduleConfig.enabled).toBe(true);
  });
  it.each(['contact', 'proof'] as const)(
    'suppresses proof disclosure after actual revocation during %s await',
    async (stage) => {
      const challenge = await issueChallenge();
      const authority = await resolver.resolve(callerToken);
      let signal!: () => void;
      let release!: () => void;
      const started = new Promise<void>((resolve) => {
        signal = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const hook = async () => {
        signal();
        await gate;
      };
      if (stage === 'contact') contactHook = hook;
      else proofInsertHook = hook;
      const pending = send({
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          code: challenge.code,
        }),
        headers: key(`st203-revoke-${stage}-key-0001`),
      });
      await started;
      repository.revokeForCurrentSession(
        sessionId,
        sessionId,
        { userId: ID },
        NOW,
      );
      release();
      const result = await pending;
      contactHook = undefined;
      proofInsertHook = undefined;
      expect(result.status).toBe(401);
      expect(result.headers['cache-control']).toBe('no-store');
      expect(result.body).not.toContain('reauthProof');
      expect(verifyCalls).toBe(stage === 'contact' ? 0 : 1);
      if (stage === 'proof')
        await expect(
          deletionProducer.verify({
            challengeId: challenge.challengeId,
            code: challenge.code,
            authority,
          }),
        ).rejects.toThrow('Deletion verification unavailable');
    },
  );
  it('does not restore a challenge or replay proof after proof-store insertion failure', async () => {
    const challenge = await issueChallenge();
    proofInsertHook = async () => {
      throw new Error('synthetic proof store fault');
    };
    const body = JSON.stringify({
      challengeId: challenge.challengeId,
      code: challenge.code,
    });
    const first = await send({
      body,
      headers: key('st203-proof-store-failure-key-0001'),
    });
    proofInsertHook = undefined;
    const duplicate = await send({
      body,
      headers: key('st203-proof-store-failure-key-0001'),
    });
    const fresh = await send({
      body,
      headers: key('st203-proof-store-failure-key-0002'),
    });
    expect([first.status, duplicate.status, fresh.status]).toEqual([
      403, 409, 403,
    ]);
    for (const result of [first, duplicate, fresh]) {
      expect(result.headers['cache-control']).toBe('no-store');
      expect(result.body).not.toContain('reauthProof');
    }
  });
  it('keeps the verify endpoint absent from the actual default application', async () => {
    const cfg = validateConfig({
      NODE_ENV: 'development',
      PORT: '3000',
      DATABASE_URL: 'postgresql://unused/unused',
    });
    const testing = await Test.createTestingModule({
      imports: [appModuleFor(cfg)],
    })
      .overrideProvider(PrismaService)
      .useValue({ $connect: async () => {}, $disconnect: async () => {} })
      .compile();
    const defaultApp = testing.createNestApplication({
      httpsOptions: { cert: ca, key: readFileSync(join(certDir, 'key.pem')) },
      logger: false,
    });
    try {
      await defaultApp.listen(0, '127.0.0.1');
      const address = defaultApp.getHttpServer().address();
      if (!address || typeof address !== 'object')
        throw new Error('default fixture did not bind');
      const result = await send({ requestPort: address.port });
      expect(result.status).toBe(404);
    } finally {
      await defaultApp.close();
    }
  });
});
