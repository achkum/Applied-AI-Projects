import 'reflect-metadata';
import { type ArgumentsHost, Catch, type DynamicModule, type ExceptionFilter, HttpException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PrismaClient } from '@prisma/client';
import type { Request, Response, NextFunction } from 'express';
import type { V2AccessToken } from '../auth/sessions-v2/v2-access-token.js';
import type { DevelopmentV2PrincipalResolver } from '../auth/sessions-v2/v2-principal-resolver.js';
import type { SessionRepository } from '../auth/sessions-v2/v2-session-issuer.js';
import type { SessionCsrfGuard } from '../auth/session-csrf/session-csrf.js';
import { BrowserSubscriptionReadHttpController, BrowserSubscriptionReadHttpService } from './browser-subscription-read.http.js';
import { BrowserSubscriptionLifecycleHttpController, BrowserSubscriptionLifecycleHttpService } from './browser-subscription-lifecycle.http.js';
import { SubscriptionLifecycleRepository } from './subscription-lifecycle.repository.js';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service.js';
import { SubscriptionReadRepository } from './subscription-read.repository.js';
import { SubscriptionReadService } from './subscription-read.service.js';

const TABLES = ['consent', 'household', 'household_member', 'identity', 'session', 'subscription', 'subscription_share'];
const STARTUP_MS = 20_000;
const CLOSE_MS = 10_000;
const denied = () => new Error('Browser subscription lifecycle startup denied');
const storageDenied = () => new Error('Browser subscription lifecycle storage preflight denied');
type ProblemStatus = 400 | 500;
const PROBLEMS: Record<ProblemStatus, Readonly<{ type: string; title: string; status: ProblemStatus; code: string }>> = {
  400: Object.freeze({ type: 'about:blank', title: 'Bad Request', status: 400, code: 'INVALID_SUBSCRIPTION_QUERY' }),
  500: Object.freeze({ type: 'about:blank', title: 'Internal Server Error', status: 500, code: 'INTERNAL_ERROR' }),
};
const parserError = (error: unknown): boolean => {
  try {
    if (!error || typeof error !== 'object' || !('type' in error) || !('status' in error)) return false;
    return (error.type === 'entity.parse.failed' && error.status === 400) ||
      (error.type === 'entity.too.large' && error.status === 413) ||
      (error.type === 'charset.unsupported' && error.status === 415) ||
      (error.type === 'encoding.unsupported' && error.status === 415);
  } catch { return false; }
};
function send(response: Response, status: ProblemStatus, request: Request): void {
  const problem = status === 400 && request.method === 'PATCH' &&
    /^\/v2\/subscriptions\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.originalUrl.split('?')[0] ?? '')
    ? { ...PROBLEMS[400], code: 'INVALID_SUBSCRIPTION_LIFECYCLE_REQUEST' } : PROBLEMS[status];
  if (!response.headersSent) response.setHeader('Cache-Control', 'no-store').setHeader('Pragma', 'no-cache')
    .status(status).type('application/problem+json').json(problem);
}
@Catch()
class BrowserSubscriptionProblemFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    let status: ProblemStatus = 500;
    try { if (parserError(error) || (error instanceof HttpException && error.getStatus() === 400)) status = 400; }
    catch { status = 500; }
    send(host.switchToHttp().getResponse<Response>(), status, host.switchToHttp().getRequest<Request>());
  }
}

export interface BrowserSubscriptionLifecycleCompositionOptions {
  readonly prisma: PrismaClient;
  readonly accessTokens: Pick<V2AccessToken, 'verify'>;
  readonly principal: Pick<DevelopmentV2PrincipalResolver, 'resolve'>;
  readonly repository: Required<Pick<SessionRepository, 'readSession' | 'webContextForCurrentSession'>>;
  readonly csrf: Pick<SessionCsrfGuard, 'verify'>;
  readonly clock: () => number;
  readonly bindingCookieName: string;
  readonly developmentEnabled: true;
  readonly host: '127.0.0.1';
  readonly port: number;
  readonly exactOrigin: string;
  readonly tls: Readonly<{ key: Buffer; cert: Buffer }>;
  readonly expectedDatabase: 'browser_subscription_lifecycle_proof';
  readonly expectedRole: 'st_browser_lifecycle_runtime';
}

function ownData(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) throw denied();
  const out: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (typeof key !== 'string' || !descriptor || !('value' in descriptor) || !descriptor.enumerable) throw denied();
    out[key] = descriptor.value;
  }
  return out;
}
function bind<T>(input: unknown, method: string): T {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw denied();
  let prototype: object | null = input;
  while (prototype) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, method);
    if (descriptor) {
      if (!('value' in descriptor) || typeof descriptor.value !== 'function') throw denied();
      return Function.prototype.bind.call(descriptor.value, input) as T;
    }
    prototype = Object.getPrototypeOf(prototype) as object | null;
  }
  throw denied();
}
function snapshotOptions(input: BrowserSubscriptionLifecycleCompositionOptions): BrowserSubscriptionLifecycleCompositionOptions {
  try {
    const c = ownData(input);
    const tls = ownData(c.tls);
    if (process.env['NODE_ENV'] === 'production' || c.developmentEnabled !== true || c.host !== '127.0.0.1' ||
        c.expectedDatabase !== 'browser_subscription_lifecycle_proof' || c.expectedRole !== 'st_browser_lifecycle_runtime' ||
        typeof c.port !== 'number' || !Number.isSafeInteger(c.port) || c.port < 1 || c.port > 65535 ||
        c.exactOrigin !== `https://127.0.0.1:${c.port}` || typeof c.clock !== 'function' ||
        !Buffer.isBuffer(tls.key) || !tls.key.length || !Buffer.isBuffer(tls.cert) || !tls.cert.length) throw denied();
    bind(c.prisma, '$queryRaw'); bind(c.prisma, '$transaction');
    return Object.freeze({ ...c,
      accessTokens: Object.freeze({ verify: bind<V2AccessToken['verify']>(c.accessTokens, 'verify') }),
      principal: Object.freeze({ resolve: bind<DevelopmentV2PrincipalResolver['resolve']>(c.principal, 'resolve') }),
      repository: Object.freeze({ readSession: bind<SessionRepository['readSession']>(c.repository, 'readSession'),
        webContextForCurrentSession: bind<NonNullable<SessionRepository['webContextForCurrentSession']>>(c.repository, 'webContextForCurrentSession') }),
      csrf: Object.freeze({ verify: bind<SessionCsrfGuard['verify']>(c.csrf, 'verify') }),
      tls: Object.freeze({ key: Buffer.from(tls.key), cert: Buffer.from(tls.cert) }),
    }) as unknown as BrowserSubscriptionLifecycleCompositionOptions;
  } catch { throw denied(); }
}

/** The caller has already proved fixture provenance and remains owner of this injected pool. */
export async function assertBrowserSubscriptionLifecycleStorage(options: BrowserSubscriptionLifecycleCompositionOptions): Promise<void> {
  options = snapshotOptions(options);
  try {
    const roles = await options.prisma.$queryRaw<{ database: string; role: string; login: boolean;
      superuser: boolean; bypass: boolean; member: boolean; memberships: bigint }[]>`
      SELECT current_database() AS database, current_user AS role, r.rolcanlogin AS login,
        r.rolsuper AS superuser, r.rolbypassrls AS bypass,
        pg_has_role(current_user, 'subtrack_runtime', 'member') AS member,
        (SELECT count(*) FROM pg_auth_members WHERE member=r.oid) AS memberships
      FROM pg_roles r WHERE r.rolname=current_user`;
    if (roles.length !== 1 || roles[0]?.database !== options.expectedDatabase || roles[0].role !== options.expectedRole ||
        !roles[0].login || roles[0].superuser || roles[0].bypass || !roles[0].member || roles[0].memberships !== 1n) throw storageDenied();
    const tables = await options.prisma.$queryRaw<{ name: string; owner: string; rls: boolean; select: boolean; update: boolean }[]>`
      SELECT c.relname AS name, pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity AS rls,
        has_table_privilege(current_user,c.oid,'SELECT') AS select,
        has_table_privilege(current_user,c.oid,'UPDATE') AS update
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN
        ('identity','session','household','household_member','consent','subscription','subscription_share')
      ORDER BY c.relname`;
    if (tables.length !== TABLES.length || tables.some((table, index) =>
      table.name !== TABLES[index] || table.owner !== 'fixture_owner' || !table.rls || !table.select || (table.name === 'subscription' && !table.update))) throw storageDenied();
    const merchant = await options.prisma.$queryRaw<{ name: string; owner: string; select: boolean }[]>`
      SELECT c.relname AS name, pg_get_userbyid(c.relowner) AS owner,
        has_table_privilege(current_user,c.oid,'SELECT') AS select
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='merchant'`;
    if (merchant.length !== 1 || merchant[0]?.name !== 'merchant' || merchant[0].owner !== 'fixture_owner' || !merchant[0].select) throw storageDenied();
  } catch { throw storageDenied(); }
}

async function bounded<T>(operation: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(denied()), ms);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

/** Private, direct-HTTPS graph. Caller disconnects Prisma and disposes auth/TLS resources after close. */
export async function createBrowserSubscriptionLifecycleApp(options: BrowserSubscriptionLifecycleCompositionOptions): Promise<{
  listen(): Promise<void>;
  close(): Promise<void>;
}> {
  const snapshot = snapshotOptions(options);
  const { prisma, accessTokens, principal, repository, csrf, clock, bindingCookieName, port,
    exactOrigin, expectedDatabase, expectedRole, host, developmentEnabled, tls } = snapshot;
  const { key, cert } = tls;
  await bounded(assertBrowserSubscriptionLifecycleStorage({ prisma, accessTokens, principal, repository, csrf, clock,
    bindingCookieName, port, exactOrigin, expectedDatabase, expectedRole, host, developmentEnabled,
    tls: { key, cert } }), STARTUP_MS).catch(() => { throw storageDenied(); });
  const shared = Object.freeze({ environment: 'development' as const, enabled: true as const,
    allowedOrigins: Object.freeze([exactOrigin]), bindingCookieName, accessTokens, principal, repository, csrf, clock });
  let read: BrowserSubscriptionReadHttpService;
  let lifecycle: BrowserSubscriptionLifecycleHttpService;
  try {
    read = new BrowserSubscriptionReadHttpService({ ...shared, subscriptions: new SubscriptionReadService(new SubscriptionReadRepository(prisma)) });
    lifecycle = new BrowserSubscriptionLifecycleHttpService({ ...shared, subscriptions: new SubscriptionLifecycleService(new SubscriptionLifecycleRepository(prisma)) });
  } catch { throw denied(); }
  class BrowserSubscriptionLifecycleModule {}
  const module: DynamicModule = { module: BrowserSubscriptionLifecycleModule,
    controllers: [BrowserSubscriptionReadHttpController, BrowserSubscriptionLifecycleHttpController],
    providers: [{ provide: BrowserSubscriptionReadHttpService, useValue: read },
      { provide: BrowserSubscriptionLifecycleHttpService, useValue: lifecycle }] };
  const creating = Promise.resolve().then(() => NestFactory.create<NestExpressApplication>(module, {
    logger: false, rawBody: true, bodyParser: false, httpsOptions: { key, cert },
  }));
  let app: NestExpressApplication;
  try { app = await bounded(creating, STARTUP_MS); }
  catch {
    void creating.then(late => bounded(late.close(), CLOSE_MS).catch(() => undefined), () => undefined);
    throw denied();
  }
  let closed = false;
  let closing: Promise<void> | undefined;
  const release = (force = false): Promise<void> => {
    closed = true;
    if (!force && closing) return closing;
    closing = bounded(Promise.resolve().then(() => {
      try {
        const server = app.getHttpServer?.() as { closeAllConnections?: () => void } | undefined;
        server?.closeAllConnections?.();
      } catch { /* Continue closing the Nest app even if socket inspection fails. */ }
      return app.close();
    }), CLOSE_MS).catch(() => { throw denied(); });
    return closing;
  };
  let initializing: Promise<NestExpressApplication>;
  try {
    app.useBodyParser('json', { limit: 256, inflate: false });
    // Parser errors are raised by Express before Nest dispatch; this middleware is their boundary.
    app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
      void _next;
      send(response, parserError(error) ? 400 : 500, _request);
    });
    app.useGlobalFilters(new BrowserSubscriptionProblemFilter());
    initializing = app.init();
  } catch {
    await release().catch(() => undefined);
    throw denied();
  }
  try { await bounded(initializing, STARTUP_MS); }
  catch {
    void initializing.then(() => release(true).catch(() => undefined), () => undefined);
    await release().catch(() => undefined);
    throw denied();
  }
  let listenStarted = false;
  return {
    async listen() {
      if (closed || listenStarted) throw denied();
      listenStarted = true;
      const listening = Promise.resolve().then(() => app.listen(port, '127.0.0.1'));
      try { await bounded(listening, STARTUP_MS); }
      catch {
        void listening.then(() => release(true).catch(() => undefined), () => undefined);
        await release().catch(() => undefined);
        throw denied();
      }
      if (closed) { await release(true).catch(() => undefined); throw denied(); }
    },
    close: () => release(),
  };
}
