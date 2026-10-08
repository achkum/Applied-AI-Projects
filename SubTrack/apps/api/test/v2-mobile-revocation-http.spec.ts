import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpsRequest } from 'node:https';
import { generateKeyPairSync } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { Test } from '@nestjs/testing';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { appModuleFor } from '../src/app.module';
import { validateConfig } from '../src/config';
import { PrismaService } from '../src/database/prisma.service';
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
import { V2MobileRevocationHttpModule } from '../src/auth/sessions-v2/v2-mobile-revocation-http.module';

const ID = '123e4567-e89b-42d3-a456-426614174000';
const NOW = Date.now();
const MOBILE = Object.freeze({ transport: 'mobile' } as const);
let app: INestApplication;
let port = 0;
let certDir = '';
let cert: Buffer;
let ca: Buffer;
let callerToken = '';
let callerSession = '';
let targetSession = '';
let repository: InMemoryV2SessionRepository;
let producer: DevelopmentSimulatorLoginProofProducer;
let issuer: DevelopmentV2SessionIssuer;
const originalVerify = BankIdSimulator.prototype.verify;

type Wire = {
  status: number;
  headers: IncomingMessage['headers'];
  body: string;
};
function send(
  path: string,
  options: {
    token?: string;
    headers?: Record<string, string | string[]>;
    body?: string;
  } = {},
  requestPort = port,
): Promise<Wire> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        hostname: 'localhost',
        family: 4,
        port: requestPort,
        path,
        method: 'DELETE',
        ca,
        headers: {
          Authorization: `Bearer ${options.token ?? callerToken}`,
          ...(options.body === undefined
            ? {}
            : { 'Content-Length': Buffer.byteLength(options.body) }),
          ...options.headers,
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
    if (options.body !== undefined) req.write(options.body);
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
  certDir = mkdtempSync(join(tmpdir(), 'subtrack-st196-https-'));
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
  const pair = generateKeyPairSync('ed25519');
  const accessTokens = new V2AccessToken({
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
  producer = new DevelopmentSimulatorLoginProofProducer({
    environment: 'development',
    enabled: true,
    simulatorHmacKey: new Uint8Array(32).fill(9),
    identityResolver: { resolveRegisteredIdentityId: () => ID },
    proofStore,
    clock,
  });
  const issue = async (deviceName: string) =>
    issuer.issueFromLoginProof({
      loginProof: await producer.issue(MOBILE),
      transportContext: MOBILE,
      deviceName,
    });
  const caller = await issue('HTTPS caller');
  const target = await issue('HTTPS target');
  callerToken = caller.accessToken;
  callerSession = caller.sessionId;
  targetSession = target.sessionId;
  const principal = new DevelopmentV2PrincipalResolver({
    environment: 'development',
    enabled: true,
    accessTokens,
    reader: repository,
    clock,
  });
  // The isolated fixture owns the DELETE route. Do not register the web revocation controller here.
  app = await NestFactory.create(
    V2MobileRevocationHttpModule.register({
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

describe('ST-196 actual HTTPS mobile revocation bridge', () => {
  it('revokes the real simulator-issued target over CA-trusted HTTPS with an empty no-store response', async () => {
    const result = await send(`/v2/me/sessions/${targetSession}`);
    expect(result.status).toBe(204);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers.pragma).toBe('no-cache');
    expect(result.headers['set-cookie']).toBeUndefined();
    expect(result.body).toBe('');
    expect(
      repository.readSession(targetSession, { userId: ID }, NOW),
    ).toBeNull();
    expect(
      repository.readSession(callerSession, { userId: ID }, NOW),
    ).not.toBeNull();
  });

  it('rejects cookie, query, duplicate bearer and malformed JSON on actual HTTPS', async () => {
    const target = await issuer.issueFromLoginProof({
      loginProof: await producer.issue(MOBILE),
      transportContext: MOBILE,
    });
    const cookie = await send(`/v2/me/sessions/${target.sessionId}`, {
      headers: { Cookie: 'unrelated=value' },
    });
    const query = await send(`/v2/me/sessions/${target.sessionId}?x=1`);
    const duplicate = await send(`/v2/me/sessions/${target.sessionId}`, {
      headers: {
        Authorization: [`Bearer ${callerToken}`, `Bearer ${callerToken}`],
      },
    });
    const malformed = await send(`/v2/me/sessions/${target.sessionId}`, {
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    for (const result of [cookie, query, duplicate, malformed]) {
      expect(result.status).toBe(400);
      expect(result.headers['cache-control']).toBe('no-store');
      expect(result.headers['set-cookie']).toBeUndefined();
    }
    expect(
      repository.readSession(target.sessionId, { userId: ID }, NOW),
    ).not.toBeNull();
  });
});

describe('mobile revocation default application boundary', () => {
  it('uses the actual default app and leaves the opt-in route absent', async () => {
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
      if (!address || typeof address !== 'object')
        throw new Error('default HTTPS server did not bind');
      const absent = await send(
        `/v2/me/sessions/${targetSession}`,
        {},
        address.port,
      );
      expect(absent.status).toBe(404);
      expect(absent.headers['set-cookie']).toBeUndefined();
    } finally {
      await isolated.close();
    }
  });
});
