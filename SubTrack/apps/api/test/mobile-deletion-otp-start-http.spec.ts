import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpsRequest } from 'node:https';
import { generateKeyPairSync } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  BrowserNonceGuard,
  InMemoryBrowserNonceStore,
} from '../src/auth/browser-nonce/browser-nonce';
import {
  SessionCsrfGuard,
  InMemorySessionCsrfStore,
} from '../src/auth/session-csrf/session-csrf';
import { DevelopmentV2SessionRefresher } from '../src/auth/sessions-v2/v2-session-refresher';
import { V2WebSessionHttpModule } from '../src/auth/sessions-v2/v2-web-session-http.module';
import { V2WebRefreshHttpModule } from '../src/auth/sessions-v2/v2-web-refresh-http.module';
import { V2MobileListingHttpModule } from '../src/auth/sessions-v2/v2-mobile-listing-http.module';
import { V2SessionRevocationHttpModule } from '../src/auth/sessions-v2/v2-session-revocation-http.module';
import { DevelopmentSimulatorLoginProofProducer } from '../src/auth/proofs-v2/bankid-simulator-proof-producer';
import { appModuleFor } from '../src/app.module';
import { validateConfig } from '../src/config';
import { PrismaService } from '../src/database/prisma.service';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BankIdSimulator } from '../src/auth/identity-provider/bankid-simulator';
import {
  DevelopmentDeletionOtpProofProducer,
  type TrustedDeletionOtpAuthority,
} from '../src/auth/proofs-v2/deletion-otp-proof-producer';
import { DevelopmentMobileDeletionOtpAuthorityResolver } from '../src/auth/proofs-v2/mobile-deletion-otp-authority';
import { MobileDeletionOtpStartHttpModule } from '../src/auth/proofs-v2/mobile-deletion-otp-start-http.module';
import {
  InMemoryProofRepository,
  ProofStore,
} from '../src/auth/proofs-v2/proof-store';
import { InMemoryIdempotencyGuard } from '../src/auth/idempotency/idempotency-guard';
import { DevelopmentV2PrincipalResolver } from '../src/auth/sessions-v2/v2-principal-resolver';
import {
  DevelopmentV2SessionIssuer,
  InMemoryV2SessionRepository,
} from '../src/auth/sessions-v2/v2-session-issuer';
import { V2AccessToken } from '../src/auth/sessions-v2/v2-access-token';

const ID = '123e4567-e89b-42d3-a456-426614174000';
const NOW = Date.now();
const MOBILE = Object.freeze({ transport: 'mobile' } as const);
const CONTACT_HASH = 'b'.repeat(64);
let app: INestApplication;
let port = 0;
let certDir = '';
let ca: Buffer;
let callerToken = '';
let callerSession = '';
let proofStore: ProofStore;
let deletionProducer: DevelopmentDeletionOtpProofProducer;
let accessTokens: V2AccessToken;
let principal: DevelopmentV2PrincipalResolver;
let repository: InMemoryV2SessionRepository;
let idempotency: InMemoryIdempotencyGuard;
const privateCodes = new Map<
  string,
  Readonly<{ challengeId: string; code: string; expiresAt: number }>
>();
const originalVerify = BankIdSimulator.prototype.verify;
const ORIGIN = 'https://app.example';
let issuer: DevelopmentV2SessionIssuer;
let simulatorLogin: DevelopmentSimulatorLoginProofProducer;
let nonce: BrowserNonceGuard;
let moduleConfig: Parameters<
  typeof MobileDeletionOtpStartHttpModule.register
>[0];

type Wire = {
  status: number;
  headers: IncomingMessage['headers'];
  body: string;
};
type SendOptions = {
  method?: string;
  noBearer?: boolean;
  requestPort?: number;
  token?: string;
  path?: string;
  headers?: Record<string, string | string[]>;
  body?: string;
};
function send(options: SendOptions = {}): Promise<Wire> {
  return new Promise((resolve, reject) => {
    const method = options.method ?? 'POST';
    const body = options.body ?? (method === 'POST' ? '{"channel":"sms"}' : '');
    const req = httpsRequest(
      {
        hostname: 'localhost',
        family: 4,
        port: options.requestPort ?? port,
        path: options.path ?? '/v2/me/reauth/otp/start',
        method,
        ca,
        headers: {
          ...(options.noBearer
            ? {}
            : { Authorization: `Bearer ${options.token ?? callerToken}` }),
          ...(body
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
              }
            : {}),
          ...(method === 'POST'
            ? { 'Idempotency-Key': 'st201-mobile-otp-start-0001' }
            : {}),
          ...(options.headers ?? {}),
        },
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
    req.on('error', reject);
    req.end(body);
  });
}
function key(value: string): Record<string, string> {
  return { 'Idempotency-Key': value };
}

beforeAll(async () => {
  BankIdSimulator.prototype.verify = async () => ({
    method: 'BANKID',
    name: 'ST201 fixture',
    personnummerHmac: 'a'.repeat(64),
    verifiedAt: new Date(NOW).toISOString(),
  });
  certDir = mkdtempSync(join(tmpdir(), 'subtrack-st201-https-'));
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
  const keyBytes = new Uint8Array(32).fill(7);
  const clock = () => NOW;
  proofStore = new ProofStore(new InMemoryProofRepository(), clock);
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
    deviceName: 'ST201 HTTPS fixture',
  });
  callerToken = session.accessToken;
  callerSession = session.sessionId;
  principal = new DevelopmentV2PrincipalResolver({
    environment: 'development',
    enabled: true,
    accessTokens,
    reader: repository,
    clock,
  });
  const registeredContacts = {
    readRegisteredContact: async (context: Readonly<{ userId: string }>) =>
      context.userId === ID
        ? Object.freeze({
            identifierHash: CONTACT_HASH,
            channel: 'sms' as const,
          })
        : null,
  };
  deletionProducer = new DevelopmentDeletionOtpProofProducer({
    environment: 'development',
    enabled: true,
    authDeleteOtpDevOnly: true,
    key: keyBytes,
    proofStore,
    clock,
  });
  const authority = {
    environment: 'development' as const,
    enabled: true as const,
    authDeleteOtpDevOnly: true as const,
    accessTokens,
    principal,
    repository,
    registeredContacts,
    clock,
  };
  const resolver = new DevelopmentMobileDeletionOtpAuthorityResolver(authority);
  idempotency = new InMemoryIdempotencyGuard({
    key: new Uint8Array(32).fill(8),
    ttlMs: 60_000,
    clock,
  });
  moduleConfig = {
    ...authority,
    otpProofs: deletionProducer,
    idempotency,
    authorityDigestKey: new Uint8Array(32).fill(6),
    codeSink: {
      storeCode(
        value: Readonly<{
          challengeId: string;
          code: string;
          expiresAt: number;
        }>,
      ): void {
        privateCodes.set(value.challengeId, Object.freeze({ ...value }));
      },
    },
  };
  nonce = new BrowserNonceGuard(
    { allowedOrigins: [ORIGIN], clock },
    new InMemoryBrowserNonceStore(),
  );
  const csrf = new SessionCsrfGuard(new InMemorySessionCsrfStore());
  const refresher = new DevelopmentV2SessionRefresher({
    environment: 'development',
    enabled: true,
    repository,
    accessTokens,
    clock,
  });
  @Module({
    imports: [
      MobileDeletionOtpStartHttpModule.register(moduleConfig),
      V2WebSessionHttpModule.register({
        environment: 'development',
        enabled: true,
        allowedOrigins: [ORIGIN],
        bindingCookieName: 'st_v2_browser',
        authorityHmacKey: new Uint8Array(32).fill(3),
        nonce,
        issuer,
        principal,
        repository,
        csrf,
        idempotency,
        clock,
      }),
      V2WebRefreshHttpModule.register({
        environment: 'development',
        enabled: true,
        allowedOrigins: [ORIGIN],
        bindingCookieName: 'st_v2_browser',
        authorityHmacKey: new Uint8Array(32).fill(4),
        refresher,
        principal,
        repository,
        csrf,
        idempotency,
        clock,
      }),
      V2MobileListingHttpModule.register({
        environment: 'development',
        enabled: true,
        accessTokens,
        principal,
        repository,
        clock,
      }),
      V2SessionRevocationHttpModule.register({
        environment: 'development',
        enabled: true,
        allowedOrigins: [ORIGIN],
        bindingCookieName: 'st_v2_browser',
        accessTokens,
        principal,
        repository,
        csrf,
        clock,
      }),
    ],
  })
  class CombinedFixtureModule {}
  app = await NestFactory.create(CombinedFixtureModule, {
    httpsOptions: { cert: ca, key: readFileSync(join(certDir, 'key.pem')) },
    logger: false,
  });
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  if (!address || typeof address !== 'object')
    throw new Error('HTTPS server did not bind');
  port = address.port;
  // Keep the independently constructed resolver live as a guard against fixture drift.
  const current = await resolver.resolve(callerToken);
  expect(current.sessionId).toBe(callerSession);
});

afterAll(async () => {
  await app?.close();
  if (certDir) rmSync(certDir, { recursive: true, force: true });
  BankIdSimulator.prototype.verify = originalVerify;
  vi.restoreAllMocks();
});

describe('ST-201 mobile deletion OTP start with shared auth modules over actual HTTPS', () => {
  it('returns only the accepted challenge handle and keeps the code private while issuing a real deletion proof', async () => {
    const result = await send({
      headers: key('st201-mobile-otp-accepted-0001'),
    });
    expect(result.status).toBe(202);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers.pragma).toBe('no-cache');
    expect(result.headers['set-cookie']).toBeUndefined();
    const body: unknown = JSON.parse(result.body);
    expect(body).toEqual({
      challengeId: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      status: 'accepted',
    });
    expect(result.body).not.toContain('code');
    const challengeId = (body as { challengeId: string }).challengeId;
    const captured = privateCodes.get(challengeId);
    expect(captured).toBeDefined();
    expect(captured?.expiresAt).toBe(NOW + 300_000);
    const resolver = new DevelopmentMobileDeletionOtpAuthorityResolver({
      environment: 'development',
      enabled: true,
      authDeleteOtpDevOnly: true,
      accessTokens,
      principal,
      repository,
      registeredContacts: {
        readRegisteredContact: async () => ({
          identifierHash: CONTACT_HASH,
          channel: 'sms',
        }),
      },
      clock: () => NOW,
    });
    const authority = await resolver.resolve(callerToken);
    const proof = await deletionProducer.verify({
      challengeId,
      code: captured!.code,
      authority: authority as TrustedDeletionOtpAuthority,
    });
    expect(proof).toMatch(/^v2\.[A-Za-z0-9_-]{43}$/);
    expect(
      await proofStore.consume(proof, {
        purpose: 'account-delete',
        challenge: challengeId,
        transport: 'mobile',
        identityId: ID,
        sessionId: callerSession,
        identifierHash: CONTACT_HASH,
      }),
    ).toEqual({ valid: true });
  });

  it('rejects channel mismatch, cookies, queries and duplicate bearer before creating another code', async () => {
    const before = privateCodes.size;
    const mismatch = await send({
      body: '{"channel":"email"}',
      headers: key('st201-mobile-otp-mismatch-0001'),
    });
    const cookie = await send({
      headers: {
        ...key('st201-mobile-otp-cookie-0001'),
        Cookie: 'unrelated=value',
      },
    });
    const query = await send({
      path: '/v2/me/reauth/otp/start?channel=sms',
      headers: key('st201-mobile-otp-query-0001'),
    });
    const duplicate = await send({
      headers: {
        ...key('st201-mobile-otp-duplicate-bearer-0001'),
        Authorization: [`Bearer ${callerToken}`, `Bearer ${callerToken}`],
      },
    });
    expect(mismatch.status).toBe(403);
    for (const result of [cookie, query, duplicate])
      expect(result.status).toBe(400);
    for (const result of [mismatch, cookie, query, duplicate]) {
      expect(result.headers['cache-control']).toBe('no-store');
      expect(result.headers['set-cookie']).toBeUndefined();
    }
    expect(privateCodes.size).toBe(before);
  });

  it('does not replay a challenge for a repeated idempotency key', async () => {
    const sameKey = 'st201-mobile-otp-repeat-0001';
    const first = await send({ headers: key(sameKey) });
    const second = await send({ headers: key(sameKey) });
    expect(first.status).toBe(202);
    expect(second.status).toBe(409);
    expect(second.body).not.toContain(
      JSON.parse(first.body).challengeId as string,
    );
    expect(privateCodes.size).toBe(2);
  });

  it('coexists with actual web bootstrap/refresh and mobile listing/revocation using shared real cores', async () => {
    const issued = nonce.issue('session', {
      origin: ORIGIN,
      isHttps: true,
      explicitLoopbackDevelopment: false,
    });
    const trusted = nonce.validateBound(
      'session',
      { origin: ORIGIN, isHttps: true, explicitLoopbackDevelopment: false },
      issued.nonce,
      issued.cookieSecret,
    );
    const webContext = Object.freeze({
      transport: 'web' as const,
      exactOrigin: ORIGIN,
      browserChainId: trusted.chainId,
    });
    const loginProof = await simulatorLogin.issue(webContext);
    const binding = `st_v2_browser=${issued.cookieSecret}`;
    const bootstrap = await send({
      path: '/v2/auth/session',
      noBearer: true,
      body: JSON.stringify({ transport: 'web', loginProof }),
      headers: {
        Origin: ORIGIN,
        Cookie: binding,
        'X-Browser-Nonce': issued.nonce,
        ...key('st201-combined-bootstrap-0001'),
      },
    });
    expect(bootstrap.status).toBe(201);
    expect(bootstrap.headers['set-cookie']).toHaveLength(2);
    const bootstrapPayload = JSON.parse(bootstrap.body) as {
      csrfToken: string;
      sessionId: string;
    };
    const cookies = bootstrap.headers['set-cookie']!.map(
      (value) => value.split(';')[0]!,
    );
    const refreshed = await send({
      path: '/v2/auth/refresh',
      noBearer: true,
      body: '',
      headers: {
        Origin: ORIGIN,
        Cookie: [binding, ...cookies].join('; '),
        'X-Session-CSRF': bootstrapPayload.csrfToken,
        ...key('st201-combined-refresh-0001'),
      },
    });
    expect(refreshed.status).toBe(200);
    expect(refreshed.headers['set-cookie']).toHaveLength(2);
    const listing = await send({ path: '/v2/me/sessions', method: 'GET' });
    expect(listing.status).toBe(200);
    expect(listing.headers['cache-control']).toBe('no-store');
    const listed = JSON.parse(listing.body) as {
      id: string;
      current: boolean;
    }[];
    expect(
      listed.some((entry) => entry.id === callerSession && entry.current),
    ).toBe(true);
    const before = privateCodes.size;
    const started = await send({ headers: key('st201-combined-start-0001') });
    expect(started.status).toBe(202);
    expect(privateCodes.size).toBe(before + 1);
    const sibling = await issuer.issueFromLoginProof({
      loginProof: await simulatorLogin.issue(MOBILE),
      transportContext: MOBILE,
      deviceName: 'ST201 sibling',
    });
    const revoked = await send({
      path: `/v2/me/sessions/${sibling.sessionId}`,
      method: 'DELETE',
    });
    expect(revoked.status).toBe(204);
    expect(revoked.headers['set-cookie']).toBeUndefined();
    expect(
      repository.readSession(sibling.sessionId, { userId: ID }, NOW),
    ).toBeNull();
    expect(
      repository.readSession(callerSession, { userId: ID }, NOW),
    ).not.toBeNull();
  });

  it('also works when registered alone in an actual trusted HTTPS app', async () => {
    const isolated = await NestFactory.create(
      MobileDeletionOtpStartHttpModule.register(moduleConfig),
      {
        httpsOptions: { cert: ca, key: readFileSync(join(certDir, 'key.pem')) },
        logger: false,
      },
    );
    try {
      await isolated.listen(0, '127.0.0.1');
      const address = isolated.getHttpServer().address();
      if (!address || typeof address !== 'object')
        throw new Error('Isolated server did not bind');
      const started = await send({
        requestPort: address.port,
        headers: key('st201-isolated-module-0001'),
      });
      expect(started.status).toBe(202);
      expect(started.headers['cache-control']).toBe('no-store');
      expect(Object.keys(JSON.parse(started.body) as object).sort()).toEqual([
        'challengeId',
        'status',
      ]);
    } finally {
      await isolated.close();
    }
  });

  it('keeps parser failures generic and no-store including query-bearing paths', async () => {
    const before = privateCodes.size;
    for (const path of [
      '/v2/me/reauth/otp/start',
      '/v2/me/reauth/otp/start?unexpected=1',
    ]) {
      const result = await send({
        path,
        body: '{ malformed',
        headers: key('st201-parser-failure-0001'),
      });
      expect(result.status).toBe(400);
      expect(result.headers['cache-control']).toBe('no-store');
      expect(result.headers['content-type']).toContain(
        'application/problem+json',
      );
      expect(result.body).not.toContain('SyntaxError');
    }
    expect(privateCodes.size).toBe(before);
  });

  it('does not register the development endpoint in the default application', async () => {
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
        throw new Error('Default server did not bind');
      const result = await send({ requestPort: address.port });
      expect(result.status).toBe(404);
    } finally {
      await defaultApp.close();
    }
  });
});
