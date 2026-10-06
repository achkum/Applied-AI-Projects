import 'reflect-metadata';
import { Controller, Get, HttpException, HttpStatus, Module, Req } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { Request } from 'express';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProblemDetailsFilter } from '../src/common/problem-details.filter';
import { v2BrowserContextMiddleware, v2NoStoreMiddleware, type V2BrowserEvidence } from '../src/auth/http/v2-browser-context';

const origin = 'http://127.0.0.1';
const cookieName = 'st_v2_browser';
const secret = 'test-cookie-value';
const config = { allowedOrigins: [origin, 'https://app.example'], bindingCookieName: cookieName, allowLoopbackHttpDevelopment: true } as const;

type ContextRequest = Request & { v2BrowserEvidence?: V2BrowserEvidence };
@Controller()
class ProbeController {
  @Get('/v2/probe') probe(@Req() req: ContextRequest) {
    const evidence = req.v2BrowserEvidence;
    return { origin: evidence?.origin, isHttps: evidence?.isHttps, explicitLoopbackDevelopment: evidence?.explicitLoopbackDevelopment, cookiePresent: evidence?.bindingCookie !== null && evidence?.bindingCookie !== undefined };
  }
  @Get('/v2/failure') failure() { throw new HttpException('private failure detail', HttpStatus.BAD_REQUEST); }
  @Get('/v1/control') v1() { return { ok: true }; }
  @Get('/v20/control') lookalike() { return { ok: true }; }
}
@Module({ controllers: [ProbeController] })
class ProbeModule {}

type WireResponse = { status: number; headers: IncomingMessage['headers']; body: string };
function send(port: number, path: string, headers: Record<string, string | string[]> = {}, secure = false, rejectUnauthorized = false): Promise<WireResponse> {
  return new Promise((resolve, reject) => {
    const sendRequest = secure ? httpsRequest : httpRequest;
    const req = sendRequest({ hostname: secure ? 'localhost' : '127.0.0.1', family: 4, port, path, method: 'GET', headers, rejectUnauthorized }, (res: IncomingMessage) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

let app: INestApplication;
let port = 0;
let httpsPort = 0;
let httpsApp: INestApplication;
let certDir: string;
let cert: Buffer;
let key: Buffer;
beforeAll(async () => {
  certDir = mkdtempSync(join(tmpdir(), 'subtrack-v2-test-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(certDir, 'key.pem'), '-out', join(certDir, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
  cert = readFileSync(join(certDir, 'cert.pem'));
  key = readFileSync(join(certDir, 'key.pem'));
  app = await NestFactory.create(ProbeModule, { logger: false });
  app.use(v2NoStoreMiddleware);
  app.use('/v2', v2BrowserContextMiddleware(config));
  app.useGlobalFilters(new ProblemDetailsFilter());
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  if (typeof address === 'object' && address) port = address.port;
  httpsApp = await NestFactory.create(ProbeModule, { httpsOptions: { cert, key }, logger: false });
  httpsApp.use(v2NoStoreMiddleware);
  httpsApp.use('/v2', v2BrowserContextMiddleware(config));
  httpsApp.useGlobalFilters(new ProblemDetailsFilter());
  await httpsApp.listen(0, '127.0.0.1');
  const secureAddress = httpsApp.getHttpServer().address();
  if (typeof secureAddress === 'object' && secureAddress) httpsPort = secureAddress.port;
});
afterAll(async () => { await app?.close(); await httpsApp?.close(); if (certDir) rmSync(certDir, { recursive: true, force: true }); });

const cache = (res: WireResponse) => {
  expect(res.headers['cache-control']).toBe('no-store');
  expect(res.headers.pragma).toBe('no-cache');
};

describe('v2 browser HTTP pipeline', () => {
  it('accepts direct loopback development HTTP and preserves absent cookie bootstrap evidence', async () => {
    const res = await send(port, '/v2/probe', { Origin: origin, 'X-Forwarded-Proto': 'https' });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ origin, isHttps: false, explicitLoopbackDevelopment: true, cookiePresent: false });
    cache(res);
  });

  it('accepts actual HTTPS socket evidence from an ephemeral test certificate', async () => {
    const res = await send(httpsPort, '/v2/probe', { Origin: 'https://app.example', Cookie: `${cookieName}=${secret}` }, true, false);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ origin: 'https://app.example', isHttps: true, explicitLoopbackDevelopment: false, cookiePresent: true });
    cache(res);
  });

  it.each([
    ['missing Origin', {}],
    ['null Origin', { Origin: 'null' }],
    ['lookalike Origin', { Origin: 'http://127.0.0.1.attacker' }],
    ['duplicate Origin', { Origin: [origin, origin] }],
    ['malformed binding cookie', { Origin: origin, Cookie: `${cookieName}="quoted"` }],
    ['whitespace binding value', { Origin: origin, Cookie: `${cookieName}= secret` }],
    ['trailing binding value whitespace before another cookie', { Origin: origin, Cookie: `${cookieName}=opaque ; other=x` }],
    ['whitespace around binding name separator', { Origin: origin, Cookie: `${cookieName} =secret` }],
    ['duplicate binding cookie', { Origin: origin, Cookie: `${cookieName}=one; ${cookieName}=two` }],
    ['forwarded HTTPS spoof on wrong origin transport', { Origin: 'https://app.example', 'X-Forwarded-Proto': 'https' }],
  ])('rejects %s generically and keeps cache policy', async (_case, headers) => {
    const res = await send(port, '/v2/probe', headers);
    expect(res.status).toBe(400);
    expect(res.body).not.toContain(secret);
    expect(res.body).not.toContain('private');
    cache(res);
  });

  it('applies cache policy to v2 failures and 404s, leaving v1 and lookalike controls untouched', async () => {
    const failure = await send(port, '/v2/failure', { Origin: origin });
    expect(failure.status).toBe(400);
    expect(failure.body).not.toContain('private failure detail');
    cache(failure);
    const missing = await send(port, '/v2/missing', { Origin: origin });
    expect(missing.status).toBe(404);
    cache(missing);
    for (const path of ['/v1/control', '/v20/control']) {
      const control = await send(port, path);
      expect(control.status).toBe(200);
      expect(control.headers['cache-control']).toBeUndefined();
      expect(control.headers.pragma).toBeUndefined();
    }
  });
});
