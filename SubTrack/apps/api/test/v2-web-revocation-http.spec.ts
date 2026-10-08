import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpsRequest } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { BankIdSimulator } from '../src/auth/identity-provider/bankid-simulator';
import {
  BrowserNonceGuard,
  InMemoryBrowserNonceStore,
} from '../src/auth/browser-nonce/browser-nonce';
import { DevelopmentSimulatorLoginProofProducer } from '../src/auth/proofs-v2/bankid-simulator-proof-producer';
import {
  InMemoryProofRepository,
  ProofStore,
} from '../src/auth/proofs-v2/proof-store';
import { InMemoryIdempotencyGuard } from '../src/auth/idempotency/idempotency-guard';
import {
  InMemorySessionCsrfStore,
  SessionCsrfGuard,
} from '../src/auth/session-csrf/session-csrf';
import { DevelopmentV2PrincipalResolver } from '../src/auth/sessions-v2/v2-principal-resolver';
import {
  DevelopmentV2SessionIssuer,
  InMemoryV2SessionRepository,
} from '../src/auth/sessions-v2/v2-session-issuer';
import { DevelopmentV2SessionRefresher } from '../src/auth/sessions-v2/v2-session-refresher';
import { V2AccessToken } from '../src/auth/sessions-v2/v2-access-token';
import { V2WebSessionHttpModule } from '../src/auth/sessions-v2/v2-web-session-http.module';
import { V2WebRefreshHttpModule } from '../src/auth/sessions-v2/v2-web-refresh-http.module';
import { V2WebRevocationHttpModule } from '../src/auth/sessions-v2/v2-web-revocation-http.module';
import { hashBrowserBindingCookie } from '../src/auth/sessions-v2/v2-web-session-binding';
import { appModuleFor } from '../src/app.module';
import { validateConfig } from '../src/config';
import { PrismaService } from '../src/database/prisma.service';

const ORIGIN = 'https://app.example';
const ID = '123e4567-e89b-42d3-a456-426614174000';
const NOW = Date.now();
let app: INestApplication;
let port = 0;
let certDir = '';
let cert: Buffer;
let key: Buffer;
let bindingCookie = '';
let accessCookie = '';
let refreshCookie = '';
let csrfToken = '';
let selfSession = '';
let requestNumber = 0;
let originalVerify: typeof BankIdSimulator.prototype.verify;
type Wire = {
  status: number;
  headers: IncomingMessage['headers'];
  body: string;
};

function send(
  options: {
    target?: string;
    csrf?: string;
    query?: boolean;
    includeRefresh?: boolean;
    body?: string;
    duplicateOrigin?: boolean;
    port?: number;
  } = {},
): Promise<Wire> {
  return new Promise((resolve, reject) => {
    const cookie = `${bindingCookie}; ${accessCookie}${options.includeRefresh ? `; ${refreshCookie}` : ''}`;
    const req = httpsRequest(
      {
        hostname: 'localhost',
        family: 4,
        port: options.port ?? port,
        path: `/v2/me/sessions/${options.target ?? selfSession}${options.query ? '?ignored=1' : ''}`,
        method: 'DELETE',
        ca: cert,
        headers: {
          Origin: options.duplicateOrigin ? [ORIGIN, ORIGIN] : ORIGIN,
          Cookie: cookie,
          ...(options.body === undefined
            ? {}
            : {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(options.body),
              }),
          'X-Session-CSRF': options.csrf ?? csrfToken,
        },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          body += chunk;
        });
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body }),
        );
      },
    );
    req.on('error', reject);
    req.end(options.body);
    requestNumber += 1;
  });
}

function postSession(input: {
  port: number;
  path: string;
  body: string;
  cookie: string;
  origin?: string;
  extra?: Record<string, string>;
}): Promise<Wire> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        hostname: 'localhost',
        family: 4,
        port: input.port,
        path: input.path,
        method: 'POST',
        ca: cert,
        headers: {
          Origin: input.origin ?? ORIGIN,
          Cookie: input.cookie,
          'Idempotency-Key': `revocation-session-key-${String(++requestNumber).padStart(6, '0')}`,
          'X-Browser-Nonce': '',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(input.body),
          ...input.extra,
        },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          body += chunk;
        });
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body }),
        );
      },
    );
    req.on('error', reject);
    req.end(input.body);
  });
}

beforeAll(async () => {
  originalVerify = BankIdSimulator.prototype.verify;
  vi.spyOn(BankIdSimulator.prototype, 'verify').mockResolvedValue({
    method: 'BANKID',
    name: 'Fictional Fixture',
    personnummerHmac: 'a'.repeat(64),
    verifiedAt: new Date(NOW).toISOString(),
  });
  certDir = mkdtempSync(join(tmpdir(), 'subtrack-st194-'));
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
  cert = readFileSync(join(certDir, 'cert.pem'));
  key = readFileSync(join(certDir, 'key.pem'));
  const clock = () => NOW;
  const nonce = new BrowserNonceGuard(
    { allowedOrigins: [ORIGIN], clock },
    new InMemoryBrowserNonceStore(),
  );
  const bootstrap = nonce.issue('session', {
    origin: ORIGIN,
    isHttps: true,
    explicitLoopbackDevelopment: false,
  });
  bindingCookie = `st_v2_browser=${bootstrap.cookieSecret}`;
  const trusted = nonce.validateBound(
    'session',
    { origin: ORIGIN, isHttps: true, explicitLoopbackDevelopment: false },
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
    simulatorHmacKey: new Uint8Array(32).fill(1),
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
  const csrf = new SessionCsrfGuard(new InMemorySessionCsrfStore());
  const idempotency = new InMemoryIdempotencyGuard({
    key: new Uint8Array(32).fill(2),
    ttlMs: 86_400_000,
    clock,
  });
  const sessionModule = V2WebSessionHttpModule.register({
    environment: 'development',
    enabled: true,
    allowedOrigins: [ORIGIN],
    bindingCookieName: 'st_v2_browser',
    authorityHmacKey: new Uint8Array(32).fill(3),
    nonce,
    issuer,
    principal,
    repository: repo,
    csrf,
    idempotency,
    clock,
  });
  const refresher = new DevelopmentV2SessionRefresher({
    environment: 'development',
    enabled: true,
    repository: repo,
    accessTokens: tokens,
    clock,
  });
  const refreshModule = V2WebRefreshHttpModule.register({
    environment: 'development',
    enabled: true,
    allowedOrigins: [ORIGIN],
    bindingCookieName: 'st_v2_browser',
    authorityHmacKey: new Uint8Array(32).fill(4),
    refresher,
    principal,
    repository: repo,
    csrf,
    idempotency,
    clock,
  });
  const revocationModule = V2WebRevocationHttpModule.register({
    environment: 'development',
    enabled: true,
    allowedOrigins: [ORIGIN],
    bindingCookieName: 'st_v2_browser',
    accessTokens: tokens,
    principal,
    repository: repo,
    csrf,
    clock,
  });
  @Module({ imports: [sessionModule, refreshModule, revocationModule] })
  class FixtureModule {}
  app = await NestFactory.create(FixtureModule, {
    httpsOptions: { cert, key },
    logger: false,
  });
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  if (!address || typeof address !== 'object')
    throw new Error('Revocation address absent');
  port = address.port;
  const initial = await postSession({
    port,
    path: '/v2/auth/session',
    body: JSON.stringify({ transport: 'web', loginProof: proof }),
    cookie: bindingCookie,
    extra: {
      'X-Browser-Nonce': bootstrap.nonce,
      'Idempotency-Key': 'revocation-bootstrap-0001',
    },
  });
  if (initial.status !== 201 || initial.headers['set-cookie']?.length !== 2)
    throw new Error('Real HTTPS session bootstrap failed');
  csrfToken = (JSON.parse(initial.body) as { csrfToken: string }).csrfToken;
  accessCookie = initial.headers['set-cookie']![0]!.split(';')[0]!;
  refreshCookie = initial.headers['set-cookie']![1]!.split(';')[0]!;
  selfSession = (JSON.parse(initial.body) as { sessionId: string }).sessionId;
  const refresh = await new Promise<Wire>((resolve, reject) => {
    const req = httpsRequest(
      {
        hostname: 'localhost',
        family: 4,
        port,
        path: '/v2/auth/refresh',
        method: 'POST',
        ca: cert,
        headers: {
          Origin: ORIGIN,
          Cookie: `${bindingCookie}; ${refreshCookie}; ${accessCookie}`,
          'Idempotency-Key': 'revocation-refresh-0001',
          'X-Session-CSRF': csrfToken,
        },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          body += chunk;
        });
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
  if (refresh.status !== 200 || refresh.headers['set-cookie']?.length !== 2)
    throw new Error('Real HTTPS refresh fixture failed');
  csrfToken = (JSON.parse(refresh.body) as { csrfToken: string }).csrfToken;
  accessCookie = refresh.headers['set-cookie']![0]!.split(';')[0]!;
  refreshCookie = refresh.headers['set-cookie']![1]!.split(';')[0]!;
  if (
    repo.readSession(selfSession, { userId: ID }, NOW)
      ?.browserBindingCookieHash !==
    hashBrowserBindingCookie(bootstrap.cookieSecret)
  )
    throw new Error('Bootstrap binding did not persist');
});

afterAll(async () => {
  await app?.close();
  if (certDir) rmSync(certDir, { recursive: true, force: true });
  if (originalVerify) BankIdSimulator.prototype.verify = originalVerify;
  vi.restoreAllMocks();
});

describe('ST-194 actual HTTPS web revocation bridge', () => {
  it('rejects the naturally scoped refresh cookie, bad CSRF, and query strings', async () => {
    const bad = await send({ csrf: 'A'.repeat(43) });
    expect(bad.status).toBe(403);
    expect(bad.headers['cache-control']).toBe('no-store');
    const refreshCookie = await send({ includeRefresh: true });
    expect(refreshCookie.status).toBe(400);
    const query = await send({ query: true });
    expect(query.status).toBe(400);
    expect(query.headers.pragma).toBe('no-cache');
  });

  it('handles malformed JSON and duplicate Origin over real TLS before revocation', async () => {
    for (const options of [
      { body: '{' },
      { body: '{}' },
      { duplicateOrigin: true },
    ]) {
      const result = await send(options);
      expect(result.status).toBe(400);
      expect(result.headers['cache-control']).toBe('no-store');
      expect(result.headers.pragma).toBe('no-cache');
      expect(result.headers['set-cookie']).toBeUndefined();
    }
    expect(
      (await send({ target: '123e4567-e89b-42d3-a456-426614174099' })).status,
    ).toBe(404);
  });

  it('revokes the current refreshed web session and returns an empty no-store 204', async () => {
    const result = await send();
    expect(result.status).toBe(204);
    expect(result.body).toBe('');
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers.pragma).toBe('no-cache');
    expect(result.headers['set-cookie']).toBeUndefined();
  });

  it('keeps revocation absent from the default application', async () => {
    const config = validateConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://api:local@localhost:5432/subtrack',
    });
    const module = await Test.createTestingModule({
      imports: [appModuleFor(config)],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: async () => undefined,
        $disconnect: async () => undefined,
      })
      .compile();
    const isolated = module.createNestApplication({
      httpsOptions: { cert, key },
      logger: false,
    });
    try {
      await isolated.listen(0, '127.0.0.1');
      const address = isolated.getHttpServer().address();
      if (!address || typeof address !== 'object')
        throw new Error('Default app port absent');
      const result = await send({ port: address.port });
      expect(result.status).toBe(404);
      expect(result.headers['set-cookie']).toBeUndefined();
    } finally {
      await isolated.close();
    }
  });
});
