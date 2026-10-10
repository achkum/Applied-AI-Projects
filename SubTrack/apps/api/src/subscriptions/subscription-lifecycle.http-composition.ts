import 'reflect-metadata';
import { type DynamicModule, type INestApplication } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import type { PrismaClient } from '@prisma/client';
import type { JwtService } from '../auth/sessions/jwt.service';
import { AuthenticatedPrincipalGuard } from '../auth/sessions/authenticated-principal.guard';
import { PrincipalResolver } from '../auth/sessions/principal-resolver';
import { PrismaSessionOwnerReader } from '../auth/sessions/prisma-session-owner-reader';
import { SubscriptionReadController } from './subscription-read.controller';
import { SubscriptionReadRepository } from './subscription-read.repository';
import { SubscriptionReadService } from './subscription-read.service';
import { SubscriptionLifecycleController, SubscriptionLifecycleProblemFilter } from './subscription-lifecycle.controller';
import { SubscriptionLifecycleRepository } from './subscription-lifecycle.repository';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';
import { bounded } from './subscription-read.composition';

const TABLES = ['consent', 'household', 'household_member', 'identity', 'session', 'subscription', 'subscription_share'];
const STARTUP_MS = 20_000;
const CLOSE_MS = 10_000;
const denied = () => new Error('Subscription lifecycle startup denied');
const preflightDenied = () => new Error('Subscription lifecycle storage preflight denied');

export interface SubscriptionLifecycleCompositionOptions {
  readonly prisma: PrismaClient;
  readonly verifier: Pick<JwtService, 'verify'>;
  readonly developmentEnabled: boolean;
  readonly host: string;
  readonly expectedDatabase: 'subscription_lifecycle_proof';
  readonly expectedRole: 'st216_runtime';
}

/** Call only after the private direct launcher has verified fixture provenance. */
export async function assertSubscriptionLifecycleStorage(options: SubscriptionLifecycleCompositionOptions): Promise<void> {
  if (options.developmentEnabled !== true || process.env['NODE_ENV'] === 'production' ||
      options.host !== '127.0.0.1' || options.expectedDatabase !== 'subscription_lifecycle_proof' ||
      options.expectedRole !== 'st216_runtime' || !options.prisma ||
      typeof options.verifier?.verify !== 'function') throw denied();
  try {
    const roles = await options.prisma.$queryRaw<{ database: string; role: string; login: boolean;
      superuser: boolean; bypass: boolean; member: boolean; memberships: bigint }[]>`
      SELECT current_database() AS database, current_user AS role, r.rolcanlogin AS login,
        r.rolsuper AS superuser, r.rolbypassrls AS bypass,
        pg_has_role(current_user, 'subtrack_runtime', 'member') AS member,
        (SELECT count(*) FROM pg_auth_members WHERE member=r.oid) AS memberships
      FROM pg_roles r WHERE r.rolname=current_user`;
    if (roles.length !== 1 || roles[0]?.database !== options.expectedDatabase ||
        roles[0].role !== options.expectedRole || !roles[0].login || roles[0].superuser ||
        roles[0].bypass || !roles[0].member || roles[0].memberships !== 1n) throw preflightDenied();
    const tables = await options.prisma.$queryRaw<{ name: string; owner: string; rls: boolean;
      select: boolean; update: boolean }[]>`
      SELECT c.relname AS name, pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity AS rls,
        has_table_privilege(current_user,c.oid,'SELECT') AS select,
        has_table_privilege(current_user,c.oid,'UPDATE') AS update
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN
        ('identity','session','household','household_member','consent','subscription','subscription_share')
      ORDER BY c.relname`;
    if (tables.length !== TABLES.length || tables.some((table, index) =>
      table.name !== TABLES[index] || table.owner !== 'fixture_owner' || !table.rls || !table.select ||
      (table.name === 'subscription' && !table.update))) throw preflightDenied();
  } catch { throw preflightDenied(); }
}

export async function createSubscriptionLifecycleApp(options: SubscriptionLifecycleCompositionOptions): Promise<{
  readonly app: INestApplication;
  listen(port: number): Promise<void>;
  close(): Promise<void>;
}> {
  await bounded(assertSubscriptionLifecycleStorage(options), STARTUP_MS);
  const resolver = new PrincipalResolver(options.verifier, new PrismaSessionOwnerReader(options.prisma));
  const guard = new AuthenticatedPrincipalGuard(resolver);
  const readService = new SubscriptionReadService(new SubscriptionReadRepository(options.prisma));
  const lifecycleService = new SubscriptionLifecycleService(new SubscriptionLifecycleRepository(options.prisma));
  class SubscriptionLifecycleModule {}
  const module: DynamicModule = {
    module: SubscriptionLifecycleModule,
    controllers: [SubscriptionReadController, SubscriptionLifecycleController],
    providers: [
      { provide: APP_GUARD, useValue: guard },
      { provide: SubscriptionReadService, useValue: readService },
      { provide: SubscriptionLifecycleService, useValue: lifecycleService },
    ],
  };
  const creating = NestFactory.create(module, { logger: false, rawBody: true });
  let app: INestApplication;
  try { app = await bounded(creating, STARTUP_MS); }
  catch {
    void creating.then(late => bounded(late.close(), CLOSE_MS).catch(() => undefined), () => undefined);
    throw denied();
  }
  app.useGlobalFilters(new SubscriptionLifecycleProblemFilter());
  const initializing = app.init();
  try { await bounded(initializing, STARTUP_MS); }
  catch {
    void initializing.then(() => bounded(app.close(), CLOSE_MS).catch(() => undefined), () => undefined);
    await bounded(app.close(), CLOSE_MS).catch(() => undefined);
    throw denied();
  }
  return {
    app,
    async listen(port: number) {
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw denied();
      await app.listen(port, '127.0.0.1');
    },
    close: () => bounded(app.close(), CLOSE_MS),
  };
}
