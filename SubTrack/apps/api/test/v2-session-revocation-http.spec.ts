import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpsRequest } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { generateKeyPairSync } from 'node:crypto';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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
import { V2MobileListingHttpModule } from '../src/auth/sessions-v2/v2-mobile-listing-http.module';
import { V2SessionRevocationHttpModule } from '../src/auth/sessions-v2/v2-session-revocation-http.module';
import { appModuleFor } from '../src/app.module';
import { validateConfig } from '../src/config';
import { PrismaService } from '../src/database/prisma.service';

const ORIGIN = 'https://app.example';
const OWNER = '123e4567-e89b-42d3-a456-426614174000';
const OTHER = '123e4567-e89b-42d3-a456-426614174001';
const NOW = Date.now();
let app: INestApplication;
let port = 0;
let certDir = '';
let cert: Buffer;
let key: Buffer;
let accessTokens: V2AccessToken;
let repository: InMemoryV2SessionRepository;
let issuer: DevelopmentV2SessionIssuer;
let producer: DevelopmentSimulatorLoginProofProducer;
let csrfToken = '';
let bindingCookie = '';
let accessCookie = '';
let refreshCookie = '';
let webSession = '';
let mobileToken = '';
let mobileSession = '';
let siblingSession = '';
let webSiblingSession = '';
let foreignSession = '';
let proofOwner = OWNER;
const originalVerify = BankIdSimulator.prototype.verify;

type Wire = {
  status: number;
  headers: IncomingMessage['headers'];
  body: string;
};
type SendOptions = {
  path?: string;
  method?: string;
  headers?: Record<string, string | string[]>;
  body?: string;
  port?: number;
};

function send(options: SendOptions = {}): Promise<Wire> {
  return new Promise((resolve, reject) => {
    const body = options.body;
    const req = httpsRequest(
      {
        hostname: 'localhost',
        family: 4,
        port: options.port ?? port,
        path: options.path ?? `/v2/me/sessions/${webSession}`,
        method: options.method ?? 'DELETE',
        ca: cert,
        headers: {
          ...(options.headers ?? {}),
          ...(body === undefined
            ? {}
            : {
                'Content-Type': 'application/json',
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
    req.end(body);
  });
}

function webHeaders(csrf = csrfToken): Record<string, string> {
  return {
    Origin: ORIGIN,
    Cookie: `${bindingCookie}; ${accessCookie}`,
    'X-Session-CSRF': csrf,
  };
}
function mobileHeaders(token = mobileToken): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}
async function issueMobile(
  deviceName: string,
): Promise<{ accessToken: string; sessionId: string }> {
  const loginProof = await producer.issue(
    Object.freeze({ transport: 'mobile' }),
  );
  return issuer.issueFromLoginProof({
    loginProof,
    transportContext: Object.freeze({ transport: 'mobile' }),
    deviceName,
  });
}
function postSession(body: string, nonce: string): Promise<Wire> {
  return send({
    path: '/v2/auth/session',
    method: 'POST',
    body,
    headers: {
      Origin: ORIGIN,
      Cookie: bindingCookie,
      'Idempotency-Key': 'st197-bootstrap-https-0001',
      'X-Browser-Nonce': nonce,
    },
  });
}
function postRefresh(): Promise<Wire> {
  return send({
    path: '/v2/auth/refresh',
    method: 'POST',
    headers: {
      Origin: ORIGIN,
      Cookie: `${bindingCookie}; ${refreshCookie}; ${accessCookie}`,
      'Idempotency-Key': 'st197-refresh-https-0001',
      'X-Session-CSRF': csrfToken,
    },
  });
}

beforeAll(async () => {
  vi.spyOn(BankIdSimulator.prototype, 'verify').mockResolvedValue({
    method: 'BANKID',
    name: 'ST197 fixture',
    personnummerHmac: 'a'.repeat(64),
    verifiedAt: new Date(NOW).toISOString(),
  });
  certDir = mkdtempSync(join(tmpdir(), 'subtrack-st197-https-'));
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
  const bootstrapNonce = nonce.issue('session', {
    origin: ORIGIN,
    isHttps: true,
    explicitLoopbackDevelopment: false,
  });
  bindingCookie = `st_v2_browser=${bootstrapNonce.cookieSecret}`;
  const trusted = nonce.validateBound(
    'session',
    { origin: ORIGIN, isHttps: true, explicitLoopbackDevelopment: false },
    bootstrapNonce.nonce,
    bootstrapNonce.cookieSecret,
  );
  const webContext = Object.freeze({
    transport: 'web' as const,
    exactOrigin: ORIGIN,
    browserChainId: trusted.chainId,
  });
  const proofs = new ProofStore(new InMemoryProofRepository(), clock);
  producer = new DevelopmentSimulatorLoginProofProducer({
    environment: 'development',
    enabled: true,
    simulatorHmacKey: new Uint8Array(32).fill(7),
    identityResolver: { resolveRegisteredIdentityId: () => proofOwner },
    proofStore: proofs,
    clock,
  });
  const webProof = await producer.issue(webContext);
  const pair = generateKeyPairSync('ed25519');
  accessTokens = new V2AccessToken({
    environment: 'development',
    enabled: true,
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    clock,
  });
  repository = new InMemoryV2SessionRepository([OWNER, OTHER], 100, clock);
  issuer = new DevelopmentV2SessionIssuer({
    environment: 'development',
    enabled: true,
    proofStore: proofs,
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
  const csrf = new SessionCsrfGuard(new InMemorySessionCsrfStore());
  const idempotency = new InMemoryIdempotencyGuard({
    key: new Uint8Array(32).fill(8),
    ttlMs: 86_400_000,
    clock,
  });
  const webModule = V2WebSessionHttpModule.register({
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
  });
  const refresher = new DevelopmentV2SessionRefresher({
    environment: 'development',
    enabled: true,
    repository,
    accessTokens,
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
    repository,
    csrf,
    idempotency,
    clock,
  });
  const revocationModule = V2SessionRevocationHttpModule.register({
    environment: 'development',
    enabled: true,
    allowedOrigins: [ORIGIN],
    bindingCookieName: 'st_v2_browser',
    accessTokens,
    principal,
    repository,
    csrf,
    clock,
  });
  const listingModule = V2MobileListingHttpModule.register({
    environment: 'development',
    enabled: true,
    accessTokens,
    principal,
    repository,
    clock,
  });
  @Module({
    imports: [webModule, refreshModule, revocationModule, listingModule],
  })
  class FixtureModule {}
  app = await NestFactory.create(FixtureModule, {
    httpsOptions: { cert, key },
    logger: false,
  });
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  if (!address || typeof address !== 'object')
    throw new Error('ST197 HTTPS listener did not bind');
  port = address.port;

  const bootstrap = await postSession(
    JSON.stringify({ transport: 'web', loginProof: webProof }),
    bootstrapNonce.nonce,
  );
  if (bootstrap.status !== 201 || bootstrap.headers['set-cookie']?.length !== 2)
    throw new Error('ST197 HTTPS bootstrap failed');
  let payload = JSON.parse(bootstrap.body) as {
    csrfToken: string;
    sessionId: string;
  };
  webSession = payload.sessionId;
  csrfToken = payload.csrfToken;
  accessCookie = bootstrap.headers['set-cookie']![0]!.split(';')[0]!;
  refreshCookie = bootstrap.headers['set-cookie']![1]!.split(';')[0]!;
  const refreshed = await postRefresh();
  if (refreshed.status !== 200 || refreshed.headers['set-cookie']?.length !== 2)
    throw new Error('ST197 HTTPS refresh failed');
  payload = JSON.parse(refreshed.body) as {
    csrfToken: string;
    sessionId: string;
  };
  csrfToken = payload.csrfToken;
  accessCookie = refreshed.headers['set-cookie']![0]!.split(';')[0]!;
  refreshCookie = refreshed.headers['set-cookie']![1]!.split(';')[0]!;

  const mobile = await issueMobile('ST197 owner phone');
  mobileToken = mobile.accessToken;
  mobileSession = mobile.sessionId;
  const sibling = await issueMobile('ST197 sibling phone');
  siblingSession = sibling.sessionId;
  const webSibling = await issuer.issueFromLoginProof({
    loginProof: await producer.issue(webContext),
    transportContext: webContext,
  });
  webSiblingSession = webSibling.sessionId;
  proofOwner = OTHER;
  const foreign = await issueMobile('ST197 foreign phone');
  foreignSession = foreign.sessionId;
  proofOwner = OWNER;
});

afterAll(async () => {
  await app?.close();
  if (certDir) rmSync(certDir, { recursive: true, force: true });
  BankIdSimulator.prototype.verify = originalVerify;
  vi.restoreAllMocks();
});

describe('ST-197 unified revocation over trusted HTTPS', () => {
  it('revokes a real web sibling through the web authority, preserving a mobile neighbor', async () => {
    const result = await send({
      path: `/v2/me/sessions/${webSiblingSession}`,
      headers: webHeaders(),
    });
    expect(result.status).toBe(204);
    expect(
      repository.readSession(webSiblingSession, { userId: OWNER }, NOW),
    ).toBeNull();
    expect(
      repository.readSession(mobileSession, { userId: OWNER }, NOW),
    ).not.toBeNull();
  });

  it('revokes a mobile caller sibling over HTTPS and retains the caller session', async () => {
    const result = await send({
      headers: mobileHeaders(),
      path: `/v2/me/sessions/${siblingSession}`,
    });
    expect(result.status).toBe(204);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers.pragma).toBe('no-cache');
    expect(result.headers['set-cookie']).toBeUndefined();
    expect(result.body).toBe('');
    expect(
      repository.readSession(siblingSession, { userId: OWNER }, NOW),
    ).toBeNull();
    expect(
      repository.readSession(mobileSession, { userId: OWNER }, NOW),
    ).not.toBeNull();
  });

  it('returns generic scoped outcomes for foreign and missing targets without touching unrelated sessions', async () => {
    const foreign = await send({
      headers: mobileHeaders(),
      path: `/v2/me/sessions/${foreignSession}`,
    });
    const missing = await send({
      headers: mobileHeaders(),
      path: '/v2/me/sessions/123e4567-e89b-42d3-a456-426614174099',
    });
    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(foreign.body).not.toContain(OTHER);
    expect(
      repository.readSession(foreignSession, { userId: OTHER }, NOW),
    ).not.toBeNull();
    expect(
      repository.readSession(mobileSession, { userId: OWNER }, NOW),
    ).not.toBeNull();
  });

  it('rejects secretless, mixed credential, refresh, malformed cookie, and malformed JSON requests without mutation', async () => {
    const target = await issueMobile('ST197 protected target');
    const before = repository.readSession(
      target.sessionId,
      { userId: OWNER },
      NOW,
    );
    const cases = [
      await send({ path: `/v2/me/sessions/${target.sessionId}` }),
      await send({
        path: `/v2/me/sessions/${target.sessionId}`,
        headers: { ...mobileHeaders(), Cookie: 'unrelated=1' },
      }),
      await send({
        path: `/v2/me/sessions/${target.sessionId}`,
        headers: {
          ...mobileHeaders(),
          Cookie: `st_v2_access=${accessCookie.split('=')[1]}`,
        },
      }),
      await send({
        path: `/v2/me/sessions/${target.sessionId}`,
        headers: {
          ...mobileHeaders(),
          Cookie: `st_v2_refresh=${refreshCookie.split('=')[1]}`,
        },
      }),
      await send({
        path: `/v2/me/sessions/${target.sessionId}`,
        headers: { Authorization: 'Basic invalid' },
      }),
      await send({
        path: `/v2/me/sessions/${target.sessionId}`,
        headers: {
          Cookie: `${bindingCookie}; ${accessCookie}; ${accessCookie}`,
          Origin: ORIGIN,
          'X-Session-CSRF': csrfToken,
        },
      }),
      await send({
        path: `/v2/me/sessions/${target.sessionId}`,
        headers: { ...mobileHeaders() },
        body: '{',
      }),
      await send({
        path: `/v2/me/sessions/${target.sessionId}?x=1`,
        headers: mobileHeaders(),
      }),
    ];
    for (const result of cases) {
      expect(result.status).toBe(400);
      expect(result.headers['cache-control']).toBe('no-store');
      expect(result.headers.pragma).toBe('no-cache');
      expect(result.headers['set-cookie']).toBeUndefined();
    }
    expect(
      repository.readSession(target.sessionId, { userId: OWNER }, NOW),
    ).toEqual(before);
  });

  it('requires web CSRF and refuses any authorization on a web-cookie request', async () => {
    const target = await issueMobile('ST197 web target');
    const before = repository.readSession(
      target.sessionId,
      { userId: OWNER },
      NOW,
    );
    const badCsrf = await send({
      path: `/v2/me/sessions/${target.sessionId}`,
      headers: webHeaders('A'.repeat(43)),
    });
    expect(badCsrf.status).toBe(403);
    expect(badCsrf.headers['cache-control']).toBe('no-store');
    const mixed = await send({
      path: `/v2/me/sessions/${target.sessionId}`,
      headers: { ...webHeaders(), Authorization: 'Bearer invalid' },
    });
    expect(mixed.status).toBe(400);
    expect(
      repository.readSession(target.sessionId, { userId: OWNER }, NOW),
    ).toEqual(before);
  });

  it('keeps mobile session listing available and unified revocation absent from the default app', async () => {
    const listing = await send({
      method: 'GET',
      path: '/v2/me/sessions',
      headers: mobileHeaders(),
    });
    expect(listing.status).toBe(200);
    expect(listing.headers['cache-control']).toBe('no-store');
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
        throw new Error('Default HTTPS fixture did not bind');
      const absent = await send({
        path: `/v2/me/sessions/${mobileSession}`,
        headers: mobileHeaders(),
        port: address.port,
      });
      expect(absent.status).toBe(404);
      expect(absent.headers['set-cookie']).toBeUndefined();
    } finally {
      await isolated.close();
    }
  });
  it('revokes the current web session through the same unified route', async () => {
    const webSelf = await send({
      path: `/v2/me/sessions/${webSession}`,
      headers: webHeaders(),
    });
    expect(webSelf.status).toBe(204);
    expect(webSelf.body).toBe('');
    expect(webSelf.headers['cache-control']).toBe('no-store');
    expect(webSelf.headers.pragma).toBe('no-cache');
    expect(webSelf.headers['set-cookie']).toBeUndefined();
    expect(
      repository.readSession(webSession, { userId: OWNER }, NOW),
    ).toBeNull();
    expect(
      repository.readSession(mobileSession, { userId: OWNER }, NOW),
    ).not.toBeNull();
  });
  it('revokes a fresh mobile self and rejects its stale token afterward', async () => {
    const mobile = await issueMobile('Self fixture');
    const result = await send({
      path: '/v2/me/sessions/' + mobile.sessionId,
      headers: mobileHeaders(mobile.accessToken),
    });
    expect(result.status).toBe(204);
    expect(result.body).toBe('');
    expect(result.headers['set-cookie']).toBeUndefined();
    expect(
      (
        await send({
          path: '/v2/me/sessions/' + mobile.sessionId,
          headers: mobileHeaders(mobile.accessToken),
        })
      ).status,
    ).toBe(401);
  });
});
