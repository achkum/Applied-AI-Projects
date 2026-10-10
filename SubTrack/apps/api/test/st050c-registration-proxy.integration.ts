import 'reflect-metadata';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { readFile, writeFile } from 'node:fs/promises';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { appModuleFor } from '../src/app.module';
import { validateConfig } from '../src/config';
import { PrismaService } from '../src/database/prisma.service';
import { ProblemDetailsFilter } from '../src/common/problem-details.filter';
import { v2BrowserContextMiddleware, v2NoStoreMiddleware } from '../src/auth/http/v2-browser-context';
import { OtpHttpService } from '../src/auth/otp-v2/otp-http';
import { httpLogger } from '../src/common/http-logger';

const repo = path.resolve(__dirname, '../../..');
const web = path.join(repo, 'apps/web');
const receiptPath = path.join(repo, '.sdlc/evidence/ST-050c/browser-receipt.json');
const origin = 'http://localhost:3000';
const ports = [3000, 4000] as const;
const checks: Record<string, boolean> = {};
let api: INestApplication | undefined;
let next: ChildProcess | undefined;
type LocatorLike = { fill(value: string): Promise<void>; click(): Promise<void>; waitFor(options: object): Promise<void>; innerText(): Promise<string>; getByText(value: RegExp): LocatorLike };
type NetworkRequestLike = { url(): string; allHeaders(): Promise<Record<string, string>> };
type NetworkResponseLike = NetworkRequestLike & { json(): Promise<unknown>; status(): number };
type PageLike = {
  goto(url: string, options: object): Promise<unknown>;
  evaluate<T, A = undefined>(fn: (arg: A) => T | Promise<T>, arg?: A): Promise<T>;
  context(): { cookies(): Promise<Array<{ name: string; httpOnly: boolean; secure: boolean; sameSite: string; path: string; domain: string; partitionKey?: string }>> };
  on(event: 'request', callback: (value: NetworkRequestLike) => void): void;
  on(event: 'response', callback: (value: NetworkResponseLike) => void): void;
  getByLabel(value: RegExp): LocatorLike;
  getByRole(role: string, options?: object): LocatorLike;
  close(): Promise<void>;
};
type BrowserLike = { newPage(): Promise<PageLike>; close(): Promise<void> };
let browser: BrowserLike | undefined;
let otp: OtpHttpService | undefined;
let prismaAccesses = 0;
const observed = {
  browserRoutes: new Set<string>(),
  directRoutes: new Set<string>(),
  forwardedSpoofRejected: false,
  cookieForwardedToStart: false,
  cookieForwardedToVerify: false,
};

function check(name: string, condition: unknown): void {
  const passed = condition === true;
  checks[name] = passed;
  if (!passed) throw new Error(`ST-050c check failed: ${name}`);
}

async function assertPortFree(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error('ST-050c required port unavailable')));
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      server.close((error) => error ? reject(new Error('ST-050c port preflight failed')) : resolve());
    });
  });
}

async function waitForWeb(child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('ST-050c Next dev process exited');
    try {
      const response = await fetch(`${origin}/en/register`, { redirect: 'manual' });
      if (response.status === 200) return;
    } catch { /* Next is compiling or binding. */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('ST-050c Next dev startup timed out');
}

async function stopProcessTree(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32' && child.pid) {
    await new Promise<void>((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      killer.once('close', () => resolve());
      killer.once('error', () => resolve());
    });
  } else {
    child.kill('SIGTERM');
  }
  await Promise.race([
    new Promise<void>((resolve) => child.once('exit', () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 10_000)),
  ]);
}

async function productionManifestHasNoProxy(): Promise<boolean> {
  const node = process.execPath;
  const resolvedCheck = spawn(node, ['-e', [
    "const load = require('./node_modules/next/dist/server/config').default;",
    "const { PHASE_PRODUCTION_BUILD } = require('./node_modules/next/dist/shared/lib/constants');",
    "load(PHASE_PRODUCTION_BUILD, process.cwd()).then(async config => {",
    "  const rewrites = config.rewrites ? await config.rewrites() : [];",
    "  process.exit(config.output === 'standalone' && !JSON.stringify(rewrites).includes('/api/v2/auth') ? 0 : 1);",
    "}).catch(() => process.exit(2));",
  ].join('\n')], {
    cwd: web,
    env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
    stdio: 'ignore', windowsHide: true,
  });
  const resolvedExit = await new Promise<number>((resolve, reject) => {
    resolvedCheck.once('error', () => reject(new Error('ST-050c production config check could not start')));
    resolvedCheck.once('close', (code) => resolve(code ?? 1));
  });
  check('productionResolvedConfigExcludesDevelopmentProxy', resolvedExit === 0);
  const nextBin = path.join(web, 'node_modules/next/dist/bin/next');
  const build = spawn(node, [nextBin, 'build'], {
    cwd: web,
    env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
    stdio: 'ignore',
    windowsHide: true,
  });
  const exitCode = await new Promise<number>((resolve, reject) => {
    build.once('error', () => reject(new Error('ST-050c production build could not start')));
    build.once('close', (code) => resolve(code ?? 1));
  });
  check('productionBuildSucceeded', exitCode === 0);
  const manifest = JSON.parse(await readFile(path.join(web, '.next/routes-manifest.json'), 'utf8')) as {
    rewrites?: { beforeFiles?: unknown[]; afterFiles?: unknown[]; fallback?: unknown[] };
  };
  const rewrites = [
    ...(manifest.rewrites?.beforeFiles ?? []),
    ...(manifest.rewrites?.afterFiles ?? []),
    ...(manifest.rewrites?.fallback ?? []),
  ];
  return rewrites.every((entry) => !JSON.stringify(entry).includes('/api/v2/auth'));
}

beforeAll(async () => {
  for (const port of ports) await assertPortFree(port);
  const productionProxyAbsent = await productionManifestHasNoProxy();
  check('productionManifestExcludesDevelopmentProxy', productionProxyAbsent);

  const env = {
    NODE_ENV: 'development',
    PORT: '4000',
    DATABASE_URL: 'postgresql://local:test@127.0.0.1:5432/st050c',
    AUTH_V2_ENABLED: 'true',
    AUTH_V2_BROWSER_NONCE_ENABLED: 'true',
    AUTH_V2_OTP_HTTP_ENABLED: 'true',
    AUTH_V2_IDEMPOTENCY_KEY: randomBytes(32).toString('hex'),
    AUTH_V2_BROWSER_ORIGIN_HMAC_KEY: randomBytes(32).toString('hex'),
    AUTH_V2_OTP_HMAC_KEY: randomBytes(32).toString('hex'),
    AUTH_V2_RATE_LIMIT_HMAC_KEY: randomBytes(32).toString('hex'),
    AUTH_V2_ALLOWED_ORIGINS: JSON.stringify([origin]),
    AUTH_V2_BINDING_COOKIE_NAME: 'st_v2_browser',
    AUTH_V2_BINDING_COOKIE_PATH: '/api/v2/auth',
    AUTH_V2_ALLOW_LOOPBACK_HTTP: 'true',
  };
  const config = validateConfig(env);
  const noDatabase = new Proxy({}, {
    get(_target, property) {
      if (typeof property === 'symbol') return undefined;
      if (property === 'constructor') return Object;
      if (property === 'onModuleInit' || property === 'onModuleDestroy' ||
          property === 'onApplicationBootstrap' || property === 'beforeApplicationShutdown' ||
          property === 'onApplicationShutdown') return undefined;
      prismaAccesses += 1;
      throw new Error('ST-050c Prisma must remain unused');
    },
  });
  const testing = await Test.createTestingModule({ imports: [appModuleFor(config)] })
    .overrideProvider(PrismaService).useValue(noDatabase)
    .compile();
  api = testing.createNestApplication({ logger: false });
  api.use(httpLogger);
  api.use(v2NoStoreMiddleware);
  api.use('/v2', (request: { rawHeaders: string[]; socket: { remoteAddress?: string }; headers: Record<string, string | undefined>; originalUrl: string }, _response: unknown, nextHandler: () => void) => {
    const rawOrigins: string[] = [];
    for (let index = 0; index < request.rawHeaders.length; index += 2) {
      if (request.rawHeaders[index]?.toLowerCase() === 'origin') rawOrigins.push(request.rawHeaders[index + 1] ?? '');
    }
    const authRoute = request.originalUrl.match(/^\/v2\/auth\/(browser-nonce|otp\/start|otp\/verify)$/)?.[1];
    if (authRoute && rawOrigins.length === 1 && rawOrigins[0] === origin) observed.browserRoutes.add(authRoute);
    const peer = request.socket.remoteAddress ?? '';
    if (authRoute && (peer === '127.0.0.1' || peer === '::ffff:127.0.0.1' || peer === '::1')) observed.directRoutes.add(authRoute);
    if (rawOrigins[0] === 'http://spoof.invalid' && request.headers['x-forwarded-proto'] === 'https') observed.forwardedSpoofRejected = true;
    const cookiePresent = (request.headers.cookie ?? '').includes('st_v2_browser=');
    if (request.originalUrl.startsWith('/v2/auth/otp/start') && cookiePresent) observed.cookieForwardedToStart = true;
    if (request.originalUrl.startsWith('/v2/auth/otp/verify') && cookiePresent) observed.cookieForwardedToVerify = true;
    nextHandler();
  });
  api.use('/v2', v2BrowserContextMiddleware({
    allowedOrigins: config.AUTH_V2_ALLOWED_ORIGINS,
    bindingCookieName: config.AUTH_V2_BINDING_COOKIE_NAME!,
    allowLoopbackHttpDevelopment: config.AUTH_V2_ALLOW_LOOPBACK_HTTP,
  }));
  api.useGlobalFilters(new ProblemDetailsFilter());
  await api.listen(4000, '127.0.0.1');
  otp = api.get(OtpHttpService);

  const requireUi = createRequire(path.join(repo, 'packages/ui/package.json'));
  const { chromium } = requireUi('playwright') as { chromium: { launch(options: object): Promise<BrowserLike> } };
  browser = await chromium.launch({ headless: true });

  const nextBin = path.join(web, 'node_modules/next/dist/bin/next');
  next = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', '3000'], {
    cwd: web,
    env: { ...process.env, NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1' },
    stdio: 'ignore',
    windowsHide: true,
  });
  await waitForWeb(next);
}, 300_000);

afterAll(async () => {
  try {
    await browser?.close();
  } finally {
    try {
      await stopProcessTree(next);
    } finally {
      try {
        await api?.close();
      } finally {
        checks.prismaNoAccess = prismaAccesses === 0;
        checks.directBrowserOriginAndPeerObserved = observed.browserRoutes.size === 3 && observed.directRoutes.size === 3;
        checks.bindingCookieForwardedToOtp = observed.cookieForwardedToStart && observed.cookieForwardedToVerify;
    await writeFile(receiptPath, `${JSON.stringify({ checks }, null, 2)}\n`, 'utf8');
      }
    }
  }
});

describe('ST-050c real Next proxy and browser enrollment', () => {
  it('proves the real OTP flow, cookie boundary, replay and origin protections', async () => {
    try {
    check('browserAndServersStarted', !!browser && !!api && !!next);
    const request = await browser!.newPage();
    await request.goto(`${origin}/en/register`, { waitUntil: 'domcontentloaded' });
    let bootstrapSetCookie = '';
    request.on('response', async (response: { url(): string; allHeaders(): Promise<Record<string, string>> }) => {
      if (response.url().endsWith('/api/v2/auth/browser-nonce')) bootstrapSetCookie = (await response.allHeaders())['set-cookie'] ?? '';
    });
    const bootstrap = await request.evaluate(async () => {
      const response = await fetch('/api/v2/auth/browser-nonce', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ purpose: 'enroll_identifier' }),
      });
      return { status: response.status, noStore: response.headers.get('cache-control') === 'no-store', value: await response.json() as { nonce?: string } };
    });
    check('bootstrap200NoStore', bootstrap.status === 200 && bootstrap.noStore && typeof bootstrap.value.nonce === 'string');
    const cookie = (await request.context().cookies()).find((item) => item.name === 'st_v2_browser');
    await new Promise((resolve) => setTimeout(resolve, 25));
    check('secureHttpOnlySameSitePathHostOnlyCookie', cookie?.httpOnly === true && cookie.secure === true && cookie.sameSite === 'Lax' && cookie.path === '/api/v2/auth' && cookie.domain === 'localhost' && !cookie.partitionKey && /;\s*secure/i.test(bootstrapSetCookie) && /;\s*httponly/i.test(bootstrapSetCookie) && /;\s*samesite=lax/i.test(bootstrapSetCookie) && !/;\s*domain=/i.test(bootstrapSetCookie));
    check('javascriptCannotReadBindingCookie', await request.evaluate(() => !(globalThis as unknown as { document: { cookie: string } }).document.cookie.includes('st_v2_browser=')));

    const start = await request.evaluate(async (nonce) => {
      const response = await fetch('/api/v2/auth/otp/start', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'X-Browser-Nonce': nonce },
        body: JSON.stringify({ channel: 'email', identifier: 'st050c@example.test', purpose: 'enroll_identifier', transport: 'web' }),
      });
      return { status: response.status, noStore: response.headers.get('cache-control') === 'no-store', value: await response.json() as { challengeId?: string; nextBrowserNonce?: string } };
    }, bootstrap.value.nonce!);
    check('otpStart202NoStore', start.status === 202 && start.noStore && typeof start.value.challengeId === 'string' && typeof start.value.nextBrowserNonce === 'string');
    check('successorNonceRotatedAtStart', start.value.nextBrowserNonce !== bootstrap.value.nonce);
    const replay = await request.evaluate(async (nonce) => {
      const response = await fetch('/api/v2/auth/otp/start', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'X-Browser-Nonce': nonce },
        body: JSON.stringify({ channel: 'email', identifier: 'st050c@example.test', purpose: 'enroll_identifier', transport: 'web' }),
      });
      return { status: response.status, noStore: response.headers.get('cache-control') === 'no-store' };
    }, bootstrap.value.nonce!);
    check('consumedNonceRejected409NoStore', replay.status === 409 && replay.noStore);

    const codeRecord = (otp as unknown as { sink: { peek(id: string, now: number): { code: string } | null } }).sink.peek(start.value.challengeId!, Date.now());
    check('processLocalOtpSinkHasCode', !!codeRecord && /^\d{6}$/.test(codeRecord.code));
    const verify = await request.evaluate(async ({ challengeId, nonce, code }) => {
      const response = await fetch('/api/v2/auth/otp/verify', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'X-Browser-Nonce': nonce },
        body: JSON.stringify({ challengeId, code, transport: 'web' }),
      });
      return { status: response.status, noStore: response.headers.get('cache-control') === 'no-store', value: await response.json() as { nextBrowserNonce?: string } };
    }, { challengeId: start.value.challengeId!, nonce: start.value.nextBrowserNonce!, code: codeRecord!.code });
    check('otpVerify200NoStore', verify.status === 200 && verify.noStore);
    check('successorNonceRotatedAtVerify', typeof verify.value.nextBrowserNonce === 'string' && verify.value.nextBrowserNonce !== start.value.nextBrowserNonce);
    const outsidePathCookie = new Promise<boolean>((resolve) => {
      request.on('request', async (resource) => {
        if (resource.url() === `${origin}/en/register`) resolve(!(await resource.allHeaders()).cookie?.includes('st_v2_browser='));
      });
    });
    await request.goto(`${origin}/en/register`, { waitUntil: 'domcontentloaded' });
    check('cookieNotSharedOutsidePath', await outsidePathCookie);

    const badOrigin = await fetch('http://127.0.0.1:4000/v2/auth/browser-nonce', {
      method: 'POST', headers: {
        Origin: 'http://spoof.invalid', 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'localhost:3000',
        Forwarded: 'proto=https;host=localhost:3000', 'Idempotency-Key': crypto.randomUUID(), 'Content-Type': 'application/json',
      }, body: JSON.stringify({ purpose: 'enroll_identifier' }),
    });
    check('badOriginWithForwardedSpoofsDenied', badOrigin.status === 400 && badOrigin.headers.get('cache-control') === 'no-store' && observed.forwardedSpoofRejected);

    const ui = await browser!.newPage();
    const uiApiRequests: Array<{ origin: string; path: string }> = [];
    const uiApiResponses: Array<{ path: string; status: number; noStore: boolean; value: Record<string, unknown> }> = [];
    ui.on('request', (resource) => {
      const url = new URL(resource.url());
      if (url.pathname.startsWith('/api/')) uiApiRequests.push({ origin: url.origin, path: url.pathname });
    });
    ui.on('response', async (response) => {
      const url = new URL(response.url());
      if (!url.pathname.startsWith('/api/v2/auth/')) return;
      try {
        const value = await response.json() as Record<string, unknown>;
        uiApiResponses.push({ path: url.pathname, status: response.status(), noStore: (await response.allHeaders())['cache-control'] === 'no-store', value });
      } catch { /* The check below fails if a response cannot be parsed. */ }
    });
    async function captured(pathname: string): Promise<{ status: number; noStore: boolean; value: Record<string, unknown> }> {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const found = uiApiResponses.find((item) => item.path === pathname);
        if (found) return found;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error('ST-050c expected browser API response missing');
    }
    await ui.goto(`${origin}/en/register`, { waitUntil: 'networkidle' });
    const uiIdentifier = 'st050c-ui@example.test';
    await ui.getByLabel(/email/i).fill(uiIdentifier);
    await ui.getByRole('button', { name: /continue/i }).click();
    await ui.getByLabel(/verification code/i).waitFor({ state: 'visible', timeout: 30_000 });
    const uiBootstrap = await captured('/api/v2/auth/browser-nonce');
    const uiStart = await captured('/api/v2/auth/otp/start');
    check('uiApiBootstrapAndStart', uiBootstrap.status === 200 && uiBootstrap.noStore && uiStart.status === 202 && uiStart.noStore && typeof uiStart.value.challengeId === 'string');
    const uiCode = (otp as unknown as { sink: { peek(id: string, now: number): { code: string } | null } }).sink.peek(uiStart.value.challengeId as string, Date.now())?.code;
    check('uiFlowCodeAvailableOnlyInProcess', typeof uiCode === 'string' && /^\d{6}$/.test(uiCode));
    await ui.getByLabel(/verification code/i).fill(uiCode!);
    await ui.getByRole('button', { name: /verify/i }).click();
    await ui.getByRole('status').getByText(/BankID/i).waitFor({ state: 'visible', timeout: 30_000 });
    const uiVerify = await captured('/api/v2/auth/otp/verify');
    check('uiApiVerify200NoStore', uiVerify.status === 200 && uiVerify.noStore);
    const uiText = await ui.getByRole('status').innerText();
    check('acceptedUiStillRequiresBankId', uiText.includes('BankID') && !uiText.toLowerCase().includes('account created'));
    const apiPaths = uiApiRequests.map((item) => item.path);
    check('onlyThreeRelativeAuthRequests', uiApiRequests.length === 3 && uiApiRequests.every((item) => item.origin === origin) && apiPaths.includes('/api/v2/auth/browser-nonce') && apiPaths.includes('/api/v2/auth/otp/start') && apiPaths.includes('/api/v2/auth/otp/verify'));
    const sensitive = [uiIdentifier, uiCode, uiBootstrap.value.nonce, uiStart.value.challengeId, uiStart.value.nextBrowserNonce, uiVerify.value.proof, uiVerify.value.nextBrowserNonce]
      .filter((value): value is string => typeof value === 'string' && value.length > 0);
    check('allUiSensitiveValuesCaptured', sensitive.length === 7);
    check('sensitiveValuesAbsentFromDomUrlAndStorage', await ui.evaluate((values) => {
      const browserGlobals = globalThis as unknown as {
        document: { documentElement: { outerHTML: string }; body: { innerText: string }; querySelectorAll(selector: string): ArrayLike<{ value: string }> };
        location: { href: string };
        localStorage: { length: number; key(index: number): string | null; getItem(key: string): string | null };
        sessionStorage: { length: number; key(index: number): string | null; getItem(key: string): string | null };
      };
      const text = [browserGlobals.document.documentElement.outerHTML, browserGlobals.document.body.innerText, browserGlobals.location.href];
      for (const input of Array.from(browserGlobals.document.querySelectorAll('input'))) text.push(input.value);
      for (const storage of [browserGlobals.localStorage, browserGlobals.sessionStorage]) {
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index);
          if (key) text.push(key, storage.getItem(key) ?? '');
        }
      }
      return values.every((value) => text.every((content) => !content.includes(value)));
    }, sensitive));
    check('prismaNoAccess', prismaAccesses === 0);
    check('directBrowserOriginAndPeerObserved', observed.browserRoutes.size === 3 && observed.directRoutes.size === 3);
    check('bindingCookieForwardedToOtp', observed.cookieForwardedToStart && observed.cookieForwardedToVerify);
    await ui.close();
    await request.close();
    } catch {
      throw new Error('ST-050c browser proof failed');
    }
  }, 360_000);
});
