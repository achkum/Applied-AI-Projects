import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpsRequest } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
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
import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { appModuleFor } from '../src/app.module';
import { validateConfig } from '../src/config';
import { PrismaService } from '../src/database/prisma.service';
import { V2WebRefreshHttpModule } from '../src/auth/sessions-v2/v2-web-refresh-http.module';

const ORIGIN = 'https://app.example';
const ID = '123e4567-e89b-42d3-a456-426614174000';
const NOW = Date.now();
let app: INestApplication;
let port = 0;
let certDir = '';
let cert: Buffer;
let key: Buffer;
let bindingCookie = '';
let refreshCookie = '';
let accessCookie = '';
let csrfToken = '';
let requestNumber = 0;
let originalVerify: typeof BankIdSimulator.prototype.verify;

type Wire = {
  status: number;
  headers: IncomingMessage['headers'];
  body: string;
};
function send(
  options: {
    body?: string;
    csrf?: string;
    duplicateOrigin?: boolean;
    duplicateRefresh?: boolean;
    query?: boolean;
    malformed?: boolean;
    port?: number;
  } = {},
): Promise<Wire> {
  return new Promise((resolve, reject) => {
    const body = options.body;
    const cookie = `${bindingCookie}; ${refreshCookie}${options.duplicateRefresh ? `; ${refreshCookie}` : ''}; ${accessCookie}`;
    const req = httpsRequest(
      {
        hostname: 'localhost',
        family: 4,
        port: options.port ?? port,
        path: `/v2/auth/refresh${options.query ? '?untrusted=1' : ''}`,
        method: 'POST',
        ca: cert,
        headers: {
          Origin: options.duplicateOrigin ? [ORIGIN, ORIGIN] : ORIGIN,
          Cookie: cookie,
          'Idempotency-Key': `refresh-wire-key-${String(++requestNumber).padStart(6, '0')}`,
          'X-Session-CSRF': options.csrf ?? csrfToken,
          ...(body === undefined
            ? {}
            : {
                'Content-Type': options.malformed
                  ? 'application/json'
                  : 'application/json',
                'Content-Length': Buffer.byteLength(body),
              }),
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
    if (body === undefined) req.end();
    else req.end(body);
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
  certDir = mkdtempSync(join(tmpdir(), 'subtrack-st193-'));
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
  const evidence = {
    origin: ORIGIN,
    isHttps: true,
    explicitLoopbackDevelopment: false,
  };
  const issuedBootstrap = nonce.issue('session', evidence);
  bindingCookie = `st_v2_browser=${issuedBootstrap.cookieSecret}`;
  const trusted = nonce.validateBound(
    'session',
    evidence,
    issuedBootstrap.nonce,
    issuedBootstrap.cookieSecret,
  );
  const context = {
    transport: 'web' as const,
    exactOrigin: ORIGIN,
    browserChainId: trusted.chainId,
  };
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
  @Module({ imports: [sessionModule, refreshModule] })
  class FixtureModule {}
  app = await NestFactory.create(FixtureModule, {
    httpsOptions: { cert, key },
    logger: false,
  });
  await app.listen(0, '127.0.0.1');
  const addr = app.getHttpServer().address();
  if (!addr || typeof addr !== 'object')
    throw new Error('Refresh address absent');
  port = addr.port;
  const encoded = JSON.stringify({ transport: 'web', loginProof: proof });
  const initial = await new Promise<Wire>((resolve, reject) => {
    const request = httpsRequest(
      {
        hostname: 'localhost',
        family: 4,
        port,
        path: '/v2/auth/session',
        method: 'POST',
        ca: cert,
        headers: {
          Origin: ORIGIN,
          Cookie: bindingCookie,
          'Idempotency-Key': 'session-wire-bootstrap-0001',
          'X-Browser-Nonce': issuedBootstrap.nonce,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(encoded),
        },
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          body += chunk;
        });
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body,
          }),
        );
      },
    );
    request.on('error', reject);
    request.end(encoded);
  });
  if (initial.status !== 201 || initial.headers['set-cookie']?.length !== 2)
    throw new Error('Real HTTPS session bootstrap failed');
  csrfToken = (JSON.parse(initial.body) as { csrfToken: string }).csrfToken;
  accessCookie = initial.headers['set-cookie'][0]!.split(';')[0]!;
  refreshCookie = initial.headers['set-cookie'][1]!.split(';')[0]!;
});

afterAll(async () => {
  await app?.close();
  if (certDir) rmSync(certDir, { recursive: true, force: true });
  if (originalVerify) BankIdSimulator.prototype.verify = originalVerify;
  vi.restoreAllMocks();
});

describe('ST-193 actual HTTPS web refresh bridge', () => {
  it('rotates credentials over trusted TLS and returns only CSRF/session metadata in JSON', async () => {
    const result = await send();
    expect(result.status).toBe(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers.pragma).toBe('no-cache');
    const payload = JSON.parse(result.body) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([
      'csrfToken',
      'sessionId',
      'transport',
    ]);
    expect(payload.transport).toBe('web');
    expect(payload.csrfToken).toEqual(expect.any(String));
    expect(result.headers['set-cookie']).toHaveLength(2);
    expect(result.body).not.toContain(refreshCookie.split('=')[1]);
    expect(result.headers['set-cookie']!.join(';')).not.toMatch(
      /Domain=|Max-Age=|Expires=/i,
    );
    csrfToken = payload.csrfToken as string;
    accessCookie = result.headers['set-cookie']![0]!.split(';')[0]!;
    refreshCookie = result.headers['set-cookie']![1]!.split(';')[0]!;
  });

  it('rejects duplicate Origin and refresh-cookie values without publishing cookies', async () => {
    const duplicateOrigin = await send({ duplicateOrigin: true });
    expect(duplicateOrigin.status).toBe(400);
    expect(duplicateOrigin.headers['set-cookie']).toBeUndefined();
    const duplicateRefresh = await send({ duplicateRefresh: true });
    expect(duplicateRefresh.status).toBe(400);
    expect(duplicateRefresh.headers['set-cookie']).toBeUndefined();
  });

  it('rejects query and malformed JSON with no-store errors before rotation', async () => {
    const query = await send({ query: true });
    expect(query.status).toBe(400);
    expect(query.headers['cache-control']).toBe('no-store');
    expect(query.headers['set-cookie']).toBeUndefined();
    const malformed = await send({ body: '{', malformed: true });
    expect(malformed.status).toBe(400);
    expect(malformed.headers['cache-control']).toBe('no-store');
    expect(malformed.headers.pragma).toBe('no-cache');
    expect(malformed.headers['set-cookie']).toBeUndefined();
  });
  it('keeps refresh absent from the default application', async () => {
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
        throw new Error('Fixture port absent');
      const result = await send({ port: address.port });
      expect(result.status).toBe(404);
      expect(result.headers['set-cookie']).toBeUndefined();
    } finally {
      await isolated.close();
    }
  });
});
