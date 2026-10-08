import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpsRequest } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { appModuleFor } from '../src/app.module';
import { validateConfig } from '../src/config';
import { PrismaService } from '../src/database/prisma.service';
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
import { V2AccessToken } from '../src/auth/sessions-v2/v2-access-token';
import { V2WebSessionHttpModule } from '../src/auth/sessions-v2/v2-web-session-http.module';

const ORIGIN = 'https://app.example';
const COOKIE_NAME = 'st_v2_browser';
const ID = '123e4567-e89b-42d3-a456-426614174000';
const NOW = Date.now();
let app: INestApplication;
let port = 0;
let certDir = '';
let cert: Buffer;
let key: Buffer;
let bootstrap: ReturnType<BrowserNonceGuard['issue']>;
let proof: string;
let nonceGuard: BrowserNonceGuard;
let proofStore: ProofStore;
const originalVerify = BankIdSimulator.prototype.verify;

type Wire = {
  status: number;
  headers: IncomingMessage['headers'];
  body: string;
};
function send(
  body: string,
  nonce: string,
  contentType = 'application/json',
  duplicateOrigin = false,
  requestPort = port,
): Promise<Wire> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        hostname: 'localhost',
        family: 4,
        port: requestPort,
        path: '/v2/auth/session',
        method: 'POST',
        ca: cert,
        headers: {
          Origin: duplicateOrigin ? [ORIGIN, ORIGIN] : ORIGIN,
          Cookie: `${COOKIE_NAME}=${bootstrap.cookieSecret}`,
          'Idempotency-Key': 'session-key-123456',
          'X-Browser-Nonce': nonce,
          'Content-Type': contentType,
          'Content-Length': Buffer.byteLength(body),
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
beforeAll(async () => {
  vi.spyOn(BankIdSimulator.prototype, 'verify').mockResolvedValue({
    method: 'BANKID',
    name: 'Fictional Fixture',
    personnummerHmac: 'a'.repeat(64),
    verifiedAt: new Date(NOW).toISOString(),
  });
  certDir = mkdtempSync(join(tmpdir(), 'subtrack-st192-'));
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
  nonceGuard = new BrowserNonceGuard(
    { allowedOrigins: [ORIGIN], clock },
    new InMemoryBrowserNonceStore(),
  );
  const evidence = {
    origin: ORIGIN,
    isHttps: true,
    explicitLoopbackDevelopment: false,
  };
  bootstrap = nonceGuard.issue('session', evidence);
  const trusted = nonceGuard.validateBound(
    'session',
    evidence,
    bootstrap.nonce,
    bootstrap.cookieSecret,
  );
  const context = {
    transport: 'web' as const,
    exactOrigin: trusted.origin,
    browserChainId: trusted.chainId,
  };
  proofStore = new ProofStore(new InMemoryProofRepository(), clock);
  const producer = new DevelopmentSimulatorLoginProofProducer({
    environment: 'development',
    enabled: true,
    simulatorHmacKey: new Uint8Array(32).fill(9),
    identityResolver: { resolveRegisteredIdentityId: () => ID },
    proofStore,
    clock,
  });
  proof = await producer.issue(context);
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
  const csrf = new SessionCsrfGuard(new InMemorySessionCsrfStore());
  app = await NestFactory.create(
    V2WebSessionHttpModule.register({
      environment: 'development',
      enabled: true,
      allowedOrigins: [ORIGIN],
      bindingCookieName: COOKIE_NAME,
      authorityHmacKey: new Uint8Array(32).fill(8),
      nonce: nonceGuard,
      issuer,
      principal,
      repository: repo,
      csrf,
      idempotency: new InMemoryIdempotencyGuard({
        key: new Uint8Array(32).fill(7),
        ttlMs: 86_400_000,
        clock,
      }),
      clock,
    }),
    { httpsOptions: { cert, key }, logger: false },
  );
  await app.listen(0, '127.0.0.1');
  const addr = app.getHttpServer().address();
  if (typeof addr === 'object' && addr) port = addr.port;
});
afterAll(async () => {
  await app?.close();
  if (certDir) rmSync(certDir, { recursive: true, force: true });
  BankIdSimulator.prototype.verify = originalVerify;
  vi.restoreAllMocks();
});

describe('ST-192 actual HTTPS bridge', () => {
  it('rejects duplicate raw Origin headers without consuming the matching nonce', async () => {
    const rejected = await send(
      JSON.stringify({ transport: 'web', loginProof: proof }),
      bootstrap.nonce,
      'application/json',
      true,
    );
    expect(rejected.status).toBe(400);
    expect(rejected.headers['set-cookie']).toBeUndefined();
    expect(rejected.headers['cache-control']).toBe('no-store');
    const accepted = await send(
      JSON.stringify({ transport: 'web', loginProof: proof }),
      bootstrap.nonce,
    );
    expect(accepted.status).toBe(201);
    expect(accepted.headers['set-cookie']).toHaveLength(2);
    expect(accepted.headers['cache-control']).toBe('no-store');
    expect(accepted.headers.pragma).toBe('no-cache');
    const payload = JSON.parse(accepted.body) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([
      'csrfToken',
      'sessionId',
      'transport',
    ]);
    expect(payload.transport).toBe('web');
    expect(accepted.body).not.toContain(proof);
    expect(accepted.body).not.toContain(bootstrap.cookieSecret);
    const cookies = accepted.headers['set-cookie'] ?? [];
    expect(cookies[0]).toMatch(
      /^st_v2_access=[^;]+; Path=\/v2; Secure; HttpOnly; SameSite=Lax$/,
    );
    expect(cookies[1]).toMatch(
      /^st_v2_refresh=[^;]+; Path=\/v2\/auth; Secure; HttpOnly; SameSite=Lax$/,
    );
    expect(cookies.join(';')).not.toMatch(/Domain=|Max-Age=|Expires=/i);
    const replays = await Promise.all([
      send(
        JSON.stringify({ transport: 'web', loginProof: proof }),
        bootstrap.nonce,
      ),
      send(
        JSON.stringify({ transport: 'web', loginProof: proof }),
        bootstrap.nonce,
      ),
    ]);
    expect(replays.map((result) => result.status)).toEqual([409, 409]);
    expect(
      replays.every((result) => result.headers['set-cookie'] === undefined),
    ).toBe(true);
  });

  it('marks malformed JSON parser failures no-store before controller dispatch', async () => {
    const res = await send('{', bootstrap.nonce, 'application/json');
    expect(res.status).toBe(400);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers.pragma).toBe('no-cache');
    expect(res.body).not.toContain(bootstrap.cookieSecret);
    expect(res.headers['set-cookie']).toBeUndefined();
  });
  it('keeps the session route absent from the default application', async () => {
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
      const result = await send(
        JSON.stringify({ transport: 'web', loginProof: proof }),
        bootstrap.nonce,
        'application/json',
        false,
        address.port,
      );
      expect(result.status).toBe(404);
      expect(result.headers['set-cookie']).toBeUndefined();
    } finally {
      await isolated.close();
    }
  });
});
