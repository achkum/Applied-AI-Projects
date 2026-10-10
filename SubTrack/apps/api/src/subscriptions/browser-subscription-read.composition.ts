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
import { SubscriptionReadRepository } from './subscription-read.repository.js';
import { SubscriptionReadService } from './subscription-read.service.js';

const TABLES = ['consent', 'household', 'household_member', 'identity', 'session', 'subscription', 'subscription_share'];
const STARTUP_MS = 20_000;
const CLOSE_MS = 10_000;
const denied = () => new Error('Browser subscription read startup denied');
const storageDenied = () => new Error('Browser subscription read storage preflight denied');
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
function send(response: Response, status: ProblemStatus): void {
  if (!response.headersSent) response.setHeader('Cache-Control', 'no-store').setHeader('Pragma', 'no-cache')
    .status(status).type('application/problem+json').json(PROBLEMS[status]);
}
@Catch()
class BrowserReadProblemFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    let status: ProblemStatus = 500;
    try { if (parserError(error) || (error instanceof HttpException && error.getStatus() === 400)) status = 400; }
    catch { status = 500; }
    send(host.switchToHttp().getResponse<Response>(), status);
  }
}

export interface BrowserSubscriptionReadCompositionOptions {
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
  readonly expectedDatabase: 'browser_subscription_read_proof';
  readonly expectedRole: 'st221_runtime';
}

function validOptions(options: BrowserSubscriptionReadCompositionOptions): boolean {
  try {
  if (!options || process.env['NODE_ENV'] === 'production' || options.developmentEnabled !== true ||
      options.host !== '127.0.0.1' || options.expectedDatabase !== 'browser_subscription_read_proof' ||
      options.expectedRole !== 'st221_runtime' || !Number.isSafeInteger(options.port) || options.port < 1 || options.port > 65535 ||
      options.exactOrigin !== `https://127.0.0.1:${options.port}` ||
      !Buffer.isBuffer(options.tls?.key) || !options.tls.key.length || !Buffer.isBuffer(options.tls.cert) || !options.tls.cert.length ||
      typeof options.prisma?.$queryRaw !== 'function' || typeof options.prisma?.$transaction !== 'function') return false;
  return true;
  } catch { return false; }
}

/** The caller has already proved fixture provenance and remains owner of this injected pool. */
export async function assertBrowserSubscriptionReadStorage(options: BrowserSubscriptionReadCompositionOptions): Promise<void> {
  if (!validOptions(options)) throw denied();
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
    const tables = await options.prisma.$queryRaw<{ name: string; owner: string; rls: boolean; select: boolean }[]>`
      SELECT c.relname AS name, pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity AS rls,
        has_table_privilege(current_user,c.oid,'SELECT') AS select
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN
        ('identity','session','household','household_member','consent','subscription','subscription_share')
      ORDER BY c.relname`;
    if (tables.length !== TABLES.length || tables.some((table, index) =>
      table.name !== TABLES[index] || table.owner !== 'fixture_owner' || !table.rls || !table.select)) throw storageDenied();
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
export async function createBrowserSubscriptionReadApp(options: BrowserSubscriptionReadCompositionOptions): Promise<{
  listen(): Promise<void>;
  close(): Promise<void>;
}> {
  let snapshot: BrowserSubscriptionReadCompositionOptions;
  try { snapshot = { ...options, tls: { key: Buffer.from(options.tls.key), cert: Buffer.from(options.tls.cert) } }; }
  catch { throw denied(); }
  if (!validOptions(snapshot)) throw denied();
  const { prisma, accessTokens, principal, repository, csrf, clock, bindingCookieName, port,
    exactOrigin, expectedDatabase, expectedRole, host, developmentEnabled, tls } = snapshot;
  const { key, cert } = tls;
  await bounded(assertBrowserSubscriptionReadStorage({ prisma, accessTokens, principal, repository, csrf, clock,
    bindingCookieName, port, exactOrigin, expectedDatabase, expectedRole, host, developmentEnabled,
    tls: { key, cert } }), STARTUP_MS).catch(() => { throw storageDenied(); });
  let service: BrowserSubscriptionReadHttpService;
  try { service = new BrowserSubscriptionReadHttpService({
    environment: 'development', enabled: true, allowedOrigins: [exactOrigin], bindingCookieName,
    accessTokens, principal, repository,
    csrf, subscriptions: new SubscriptionReadService(new SubscriptionReadRepository(prisma)), clock,
  }); } catch { throw denied(); }
  class BrowserSubscriptionReadModule {}
  const module: DynamicModule = { module: BrowserSubscriptionReadModule, controllers: [BrowserSubscriptionReadHttpController],
    providers: [{ provide: BrowserSubscriptionReadHttpService, useValue: service }] };
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
    app.useBodyParser('json', { limit: 64, inflate: false });
    // Parser errors are raised by Express before Nest dispatch; this middleware is their boundary.
    app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
      void _next;
      send(response, parserError(error) ? 400 : 500);
    });
    app.useGlobalFilters(new BrowserReadProblemFilter());
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
