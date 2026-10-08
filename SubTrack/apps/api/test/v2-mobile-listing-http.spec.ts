import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpsRequest } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { Test } from '@nestjs/testing';
import { appModuleFor } from '../src/app.module';
import { validateConfig } from '../src/config';
import { PrismaService } from '../src/database/prisma.service';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { BankIdSimulator } from '../src/auth/identity-provider/bankid-simulator';
import { DevelopmentSimulatorLoginProofProducer } from '../src/auth/proofs-v2/bankid-simulator-proof-producer';
import {
  InMemoryProofRepository,
  ProofStore,
} from '../src/auth/proofs-v2/proof-store';
import { DevelopmentV2PrincipalResolver } from '../src/auth/sessions-v2/v2-principal-resolver';
import {
  DevelopmentV2SessionIssuer,
  InMemoryV2SessionRepository,
} from '../src/auth/sessions-v2/v2-session-issuer';
import { V2AccessToken } from '../src/auth/sessions-v2/v2-access-token';
import { V2MobileListingHttpModule } from '../src/auth/sessions-v2/v2-mobile-listing-http.module';

const ID = '123e4567-e89b-42d3-a456-426614174000';
const NOW = Date.now();
let app: INestApplication;
let port = 0;
let certDir = '';
let cert: Buffer;
let ca: Buffer;
let token = '';
let repository: InMemoryV2SessionRepository;
let issuer: DevelopmentV2SessionIssuer;
let producer: DevelopmentSimulatorLoginProofProducer;
const originalVerify = BankIdSimulator.prototype.verify;

type Wire = {
  status: number;
  headers: IncomingMessage['headers'];
  body: string;
};
function send(
  path = '/v2/me/sessions',
  headers: Record<string, string | string[]> = {},
  requestPort = port,
): Promise<Wire> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        hostname: 'localhost',
        family: 4,
        port: requestPort,
        path,
        method: 'GET',
        ca,
        headers: { Authorization: `Bearer ${token}`, ...headers },
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
}

beforeAll(async () => {
  BankIdSimulator.prototype.verify = async () => ({
    method: 'BANKID',
    name: 'Fixture',
    personnummerHmac: 'a'.repeat(64),
    verifiedAt: new Date(NOW).toISOString(),
  });
  certDir = mkdtempSync(join(tmpdir(), 'subtrack-st195-https-'));
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
  ca = cert;
  const clock = () => NOW;
  const proofStore = new ProofStore(new InMemoryProofRepository(), clock);
  producer = new DevelopmentSimulatorLoginProofProducer({
    environment: 'development',
    enabled: true,
    simulatorHmacKey: new Uint8Array(32).fill(9),
    identityResolver: { resolveRegisteredIdentityId: () => ID },
    proofStore,
    clock,
  });
  const keys = generateKeyPairSync('ed25519');
  const accessTokens = new V2AccessToken({
    environment: 'development',
    enabled: true,
    privateKey: keys.privateKey,
    publicKey: keys.publicKey,
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
  const proof = await producer.issue(Object.freeze({ transport: 'mobile' }));
  const issued = await issuer.issueFromLoginProof({
    loginProof: proof,
    transportContext: Object.freeze({ transport: 'mobile' }),
    deviceName: 'TLS fixture phone',
  });
  token = issued.accessToken;
  const principal = new DevelopmentV2PrincipalResolver({
    environment: 'development',
    enabled: true,
    accessTokens,
    reader: repository,
    clock,
  });
  app = await NestFactory.create(
    V2MobileListingHttpModule.register({
      environment: 'development',
      enabled: true,
      accessTokens,
      principal,
      repository,
      clock,
    }),
    {
      httpsOptions: { cert, key: readFileSync(join(certDir, 'key.pem')) },
      logger: false,
    },
  );
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  if (!address || typeof address !== 'object')
    throw new Error('HTTPS test server did not bind');
  port = address.port;
});

afterAll(async () => {
  await app?.close();
  if (certDir) rmSync(certDir, { recursive: true, force: true });
  BankIdSimulator.prototype.verify = originalVerify;
  vi.restoreAllMocks();
});

describe('ST-195 actual HTTPS mobile listing bridge', () => {
  it('serves the real mobile token over CA-trusted HTTPS with no-store and credential-free summaries', async () => {
    const result = await send();
    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toContain('application/json');
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers.pragma).toBe('no-cache');
    expect(result.headers['set-cookie']).toBeUndefined();
    expect(result.body).not.toContain(token);
    expect(JSON.parse(result.body)).toEqual([
      {
        id: expect.any(String),
        createdAt: new Date(NOW).toISOString(),
        current: true,
        deviceName: 'TLS fixture phone',
      },
    ]);
  });

  it('rejects duplicate raw credentials, cookie and query over real HTTPS', async () => {
    const duplicate = await send('/v2/me/sessions', {
      Authorization: [`Bearer ${token}`, `Bearer ${token}`],
    });
    expect(duplicate.status).toBe(400);
    expect(duplicate.headers['cache-control']).toBe('no-store');
    const cookie = await send('/v2/me/sessions', { Cookie: 'unrelated=value' });
    expect(cookie.status).toBe(400);
    expect(cookie.headers['set-cookie']).toBeUndefined();
    const query = await send('/v2/me/sessions?limit=1');
    expect(query.status).toBe(400);
    expect(query.headers['cache-control']).toBe('no-store');
  });

  it('keeps malformed JSON parser failures no-store', async () => {
    const malformed = await new Promise<Wire>((resolve, reject) => {
      const req = httpsRequest(
        {
          hostname: 'localhost',
          family: 4,
          port,
          path: '/v2/me/sessions',
          method: 'GET',
          ca,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Content-Length': '1',
          },
        },
        (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => {
            body += chunk;
          });
          res.on('end', () =>
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              body,
            }),
          );
        },
      );
      req.on('error', reject);
      req.end('{');
    });
    expect(malformed.status).toBe(400);
    expect(malformed.headers['cache-control']).toBe('no-store');
    expect(malformed.headers.pragma).toBe('no-cache');
  });
});

describe('mobile listing default application boundary', () => {
  it('remains absent without opt-in module registration', async () => {
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
      httpsOptions: { cert, key: readFileSync(join(certDir, 'key.pem')) },
      logger: false,
    });
    try {
      await isolated.listen(0, '127.0.0.1');
      const address = isolated.getHttpServer().address();
      if (!address || typeof address !== 'object') throw new Error('port');
      const result = await send('/v2/me/sessions', {}, address.port);
      expect(result.status).toBe(404);
      expect(result.headers['set-cookie']).toBeUndefined();
    } finally {
      await isolated.close();
    }
  });
});
