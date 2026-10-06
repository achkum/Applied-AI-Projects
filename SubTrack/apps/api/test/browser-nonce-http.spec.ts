import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appModuleFor } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/problem-details.filter';
import { validateConfig } from '../src/config';
import { v2BrowserContextMiddleware, v2NoStoreMiddleware } from '../src/auth/http/v2-browser-context';
import { BrowserNonceHttpService } from '../src/auth/browser-nonce/browser-nonce-http';
import type { BrowserNonceGuard } from '../src/auth/browser-nonce/browser-nonce';
import { PrismaService } from '../src/database/prisma.service';

const cookieName = 'st_v2_browser';
const origin = 'https://localhost';
const env = {
  NODE_ENV: 'development', DATABASE_URL: 'postgresql://api:local@localhost:5432/subtrack',
  AUTH_V2_ENABLED: 'true', AUTH_V2_BROWSER_NONCE_ENABLED: 'true',
  AUTH_V2_IDEMPOTENCY_KEY: 'ab'.repeat(32), AUTH_V2_BROWSER_ORIGIN_HMAC_KEY: 'cd'.repeat(32),
  AUTH_V2_ALLOWED_ORIGINS: JSON.stringify([origin]), AUTH_V2_BINDING_COOKIE_NAME: cookieName,
  AUTH_V2_BINDING_COOKIE_PATH: '/v2/auth',
};
type WireResponse = { status: number; headers: IncomingMessage['headers']; body: string };
function send(port: number, path: string, headers: Record<string, string | string[]> = {}, secure = false): Promise<WireResponse> {
  return new Promise((resolve, reject) => {
    const sendRequest = secure ? httpsRequest : httpRequest;
  const req = sendRequest({ hostname: 'localhost', family: 4, port, path, method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, rejectUnauthorized: false }, (res: IncomingMessage) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end(JSON.stringify({ purpose: 'session' }));
  });
}
function checkCache(res: WireResponse): void {
  expect(res.headers['cache-control']).toBe('no-store');
  expect(res.headers.pragma).toBe('no-cache');
}

let app: INestApplication;
let httpsApp: INestApplication;
let httpPort = 0;
let httpsPort = 0;
let certDir = '';
const prismaStub = { $connect: async () => undefined, $disconnect: async () => undefined };
async function createApp(config: ReturnType<typeof validateConfig>, tls?: { key: Buffer; cert: Buffer }): Promise<INestApplication> {
  const module = await Test.createTestingModule({ imports: [appModuleFor(config)] })
    .overrideProvider(PrismaService).useValue(prismaStub).compile();
  const instance = module.createNestApplication(tls ? { httpsOptions: tls, logger: false } : { logger: false });
  instance.use(v2NoStoreMiddleware);
  if (config.AUTH_V2_ENABLED) instance.use('/v2', v2BrowserContextMiddleware({ allowedOrigins: config.AUTH_V2_ALLOWED_ORIGINS, bindingCookieName: config.AUTH_V2_BINDING_COOKIE_NAME!, allowLoopbackHttpDevelopment: config.AUTH_V2_ALLOW_LOOPBACK_HTTP }));
  instance.useGlobalFilters(new ProblemDetailsFilter());
  return instance;
}
beforeAll(async () => {
  certDir = mkdtempSync(join(tmpdir(), 'subtrack-nonce-wire-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(certDir, 'key.pem'), '-out', join(certDir, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
  const tls = { key: readFileSync(join(certDir, 'key.pem')), cert: readFileSync(join(certDir, 'cert.pem')) };
  const config = validateConfig(env);
  app = await createApp(config);
  await app.listen(0, '127.0.0.1');
  httpPort = (app.getHttpServer().address() as { port: number }).port;
  httpsApp = await createApp(config, tls);
  await httpsApp.listen(0, '127.0.0.1');
  httpsPort = (httpsApp.getHttpServer().address() as { port: number }).port;
});
afterAll(async () => { await app?.close(); await httpsApp?.close(); if (certDir) rmSync(certDir, { recursive: true, force: true }); });

describe('registered development browser nonce endpoint', () => {
  it('returns the public nonce contract and a host-only Secure cookie over HTTPS', async () => {
    const first = await send(httpsPort, '/v2/auth/browser-nonce', { Origin: origin, 'Idempotency-Key': 'nonce-wire-key-0001' }, true);
    expect(first.status, first.body).toBe(200);
    const body = JSON.parse(first.body) as { nonce: string; [key: string]: unknown };
    expect(Object.keys(body).sort()).toEqual(['nonce']);
    expect(body.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body).not.toHaveProperty('cookieSecret');
    const setCookie = first.headers['set-cookie']?.[0];
    expect(setCookie).toMatch(new RegExp(`^${cookieName}=[A-Za-z0-9_-]{43};`));
    expect(setCookie).toMatch(/; Path=\/v2\/auth;/);
    expect(setCookie).toMatch(/; Secure;/);
    expect(setCookie).toMatch(/; HttpOnly;/);
    expect(setCookie).toMatch(/; SameSite=Lax$/);
    expect(setCookie).not.toMatch(/; Domain=/i);
    checkCache(first);
    const cookie = setCookie!.split(';', 1)[0]!;
    const roundTrip = await send(httpsPort, '/v2/auth/browser-nonce', { Origin: origin, Cookie: cookie, 'Idempotency-Key': 'nonce-wire-key-0002' }, true);
    expect(roundTrip.status).toBe(200);
    // Inspect the registered service's real guard to verify state, without adding a debug route.
    const guard = (httpsApp.get(BrowserNonceHttpService) as unknown as { nonce: BrowserNonceGuard }).nonce;
    const priorCookie = cookie.slice(cookie.indexOf('=') + 1);
    expect(() => guard.consumeAndRotate('session', { origin, isHttps: true, explicitLoopbackDevelopment: false }, body.nonce, priorCookie)).toThrow();
    expect(roundTrip.headers['set-cookie']?.[0]).not.toBe(setCookie);
    checkCache(roundTrip);
  });

  it('keeps Secure on explicit loopback HTTP and applies configured Path', async () => {
    // Node HTTP clients accept Secure cookies manually; browsers may not accept them on IP-loopback HTTP.
    const localEnv = { ...env, AUTH_V2_ALLOWED_ORIGINS: '["http://localhost"]', AUTH_V2_ALLOW_LOOPBACK_HTTP: 'true' };
    const config = validateConfig(localEnv);
    const local = await createApp(config);
    await local.listen(0, '127.0.0.1');
    try {
      const port = (local.getHttpServer().address() as { port: number }).port;
      const res = await send(port, '/v2/auth/browser-nonce', { Host: 'localhost', Origin: 'http://localhost', 'Idempotency-Key': 'nonce-http-key-0003' });
      expect(res.status).toBe(200);
      expect(res.headers['set-cookie']?.[0]).toMatch(/; Secure;/);
      expect(res.headers['set-cookie']?.[0]).toMatch(/; Path=\/v2\/auth;/);
      checkCache(res);
      for (let index = 0; index < 59; index++) {
        const accepted = await send(port, '/v2/auth/browser-nonce', { Origin: 'http://localhost', 'Idempotency-Key': `nonce-throttle-key-${index}` });
        expect(accepted.status).toBe(200);
      }
      const blocked = await send(port, '/v2/auth/browser-nonce', { Origin: 'http://localhost', 'Idempotency-Key': 'nonce-throttle-overflow' });
      expect(blocked.status).toBe(429);
      expect(blocked.headers['set-cookie']).toBeUndefined();
      expect(JSON.parse(blocked.body)).not.toHaveProperty('nonce');
      checkCache(blocked);
    } finally { await local.close(); }
  });

  it('rejects transport and request evidence and never replays a duplicate key', async () => {
    const wrongTls = await send(httpPort, '/v2/auth/browser-nonce', { Origin: origin, 'Idempotency-Key': 'nonce-tls-key-0004' });
    expect(wrongTls.status).toBe(400); checkCache(wrongTls);
    const badOrigin = await send(httpsPort, '/v2/auth/browser-nonce', { Origin: 'https://localhost.attacker', 'Idempotency-Key': 'nonce-origin-key-0005' }, true);
    expect(badOrigin.status).toBe(400); checkCache(badOrigin);
    const invalidPurpose = await new Promise<WireResponse>((resolve, reject) => {
      const req = httpsRequest({ hostname: 'localhost', family: 4, port: httpsPort, path: '/v2/auth/browser-nonce', method: 'POST', rejectUnauthorized: false, headers: { 'Content-Type': 'application/json', Origin: origin, 'Idempotency-Key': 'nonce-purpose-key-0006' } }, (res) => { let body=''; res.setEncoding('utf8'); res.on('data',(chunk:string)=>body+=chunk); res.on('end',()=>resolve({status:res.statusCode??0,headers:res.headers,body})); });
      req.on('error', reject); req.end(JSON.stringify({ purpose: 'unsupported' }));
    });
    expect(invalidPurpose.status).toBe(400); checkCache(invalidPurpose);
    const requestId = 'nonce-duplicate-key-0007';
    const initial = await send(httpsPort, '/v2/auth/browser-nonce', { Origin: origin, 'Idempotency-Key': requestId }, true);
    expect(initial.status).toBe(200);
    const replay = await send(httpsPort, '/v2/auth/browser-nonce', { Origin: origin, 'Idempotency-Key': requestId }, true);
    expect(replay.status).toBe(409);
    expect(replay.body).toContain('AUTH_RESTART_REQUIRED');
    expect(replay.body).not.toContain(JSON.parse(initial.body).nonce);
    expect(replay.headers['set-cookie']).toBeUndefined();
    checkCache(replay);
  });

  it('rejects duplicate raw Origin headers and malformed observed binding cookies', async () => {
    const duplicateOrigin = await send(httpsPort, '/v2/auth/browser-nonce', { Origin: [origin, origin], 'Idempotency-Key': 'nonce-duplicate-origin-0010' }, true);
    expect(duplicateOrigin.status).toBe(400); expect(duplicateOrigin.headers['set-cookie']).toBeUndefined(); checkCache(duplicateOrigin);
    const malformedCookie = await send(httpsPort, '/v2/auth/browser-nonce', { Origin: origin, Cookie: `${cookieName}=bad`, 'Idempotency-Key': 'nonce-malformed-cookie-0011' }, true);
    expect(malformedCookie.status).toBe(400); expect(malformedCookie.headers['set-cookie']).toBeUndefined(); checkCache(malformedCookie);
  });

  it('issues independent bootstrap chains when no prior cookie is presented', async () => {
    const first = await send(httpsPort, '/v2/auth/browser-nonce', { Origin: origin, 'Idempotency-Key': 'nonce-independent-0012' }, true);
    const second = await send(httpsPort, '/v2/auth/browser-nonce', { Origin: origin, 'Idempotency-Key': 'nonce-independent-0013' }, true);
    expect(first.status).toBe(200); expect(second.status).toBe(200);
    expect(JSON.parse(first.body).nonce).not.toBe(JSON.parse(second.body).nonce);
    expect(first.headers['set-cookie']?.[0]).not.toBe(second.headers['set-cookie']?.[0]);
  });

  it('rejects duplicate raw idempotency headers before reservation', async () => {
    const res = await send(httpsPort, '/v2/auth/browser-nonce', { Origin: origin, 'Idempotency-Key': ['nonce-raw-duplicate-0008', 'nonce-raw-duplicate-0009'] }, true);
    expect(res.status).toBe(400);
    expect(res.body).not.toContain('nonce');
    expect(res.headers['set-cookie']).toBeUndefined();
    checkCache(res);
  });

  it('does not register the route when the development flag is off', async () => {
    const disabled = validateConfig({ DATABASE_URL: env.DATABASE_URL, NODE_ENV: 'development' });
    const closed = await createApp(disabled);
    await closed.listen(0, '127.0.0.1');
    try {
      const port = (closed.getHttpServer().address() as { port: number }).port;
      const res = await send(port, '/v2/auth/browser-nonce', {});
      expect(res.status).toBe(404);
      checkCache(res);
    } finally { await closed.close(); }
  });
});
