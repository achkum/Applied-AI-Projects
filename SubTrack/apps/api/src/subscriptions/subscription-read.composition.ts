import 'reflect-metadata';
import { type DynamicModule, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { APP_GUARD } from '@nestjs/core';
import type { PrismaClient } from '@prisma/client';
import type { JwtService } from '../auth/sessions/jwt.service';
import { AuthenticatedPrincipalGuard } from '../auth/sessions/authenticated-principal.guard';
import { PrincipalResolver } from '../auth/sessions/principal-resolver';
import { PrismaSessionOwnerReader } from '../auth/sessions/prisma-session-owner-reader';
import { SubscriptionReadController } from './subscription-read.controller';
import { SubscriptionReadRepository } from './subscription-read.repository';
import { SubscriptionReadService } from './subscription-read.service';

const TABLES = ['consent', 'household', 'household_member', 'identity', 'session', 'subscription', 'subscription_share'];
const STARTUP_MS = 20_000;
const CLOSE_MS = 10_000;

export async function bounded<T>(operation: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Subscription read operation timed out')), ms);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

async function closeApp(app: INestApplication): Promise<void> {
  await bounded(app.close(), CLOSE_MS);
}

export interface SubscriptionReadCompositionOptions {
  readonly prisma: PrismaClient;
  readonly verifier: Pick<JwtService, 'verify'>;
  readonly developmentEnabled: boolean;
  readonly host: string;
  readonly expectedDatabase: 'subscription_read_proof';
  readonly expectedRole: 'st212_runtime';
}

/** Startup preconditions are checked on the same pool used by all route components. */
export async function assertSubscriptionReadStorage(options: SubscriptionReadCompositionOptions): Promise<void> {
  if (options.developmentEnabled !== true || process.env['NODE_ENV'] === 'production' ||
      options.host !== '127.0.0.1' || options.expectedDatabase !== 'subscription_read_proof' ||
      options.expectedRole !== 'st212_runtime' || !options.prisma ||
      typeof options.verifier?.verify !== 'function') throw new Error('Subscription read startup denied');
  try {
    const rows = await options.prisma.$queryRaw<{ database: string; role: string; login: boolean;
      superuser: boolean; bypass: boolean; member: boolean; memberships: bigint; }[]>`
      SELECT current_database() AS database, current_user AS role, r.rolcanlogin AS login,
        r.rolsuper AS superuser, r.rolbypassrls AS bypass,
        pg_has_role(current_user, 'subtrack_runtime', 'member') AS member,
        (SELECT count(*) FROM pg_auth_members WHERE member=r.oid) AS memberships
      FROM pg_roles r WHERE r.rolname=current_user`;
    if (rows.length !== 1 || rows[0]?.database !== options.expectedDatabase ||
        rows[0].role !== options.expectedRole || !rows[0].login || rows[0].superuser ||
        rows[0].bypass || !rows[0].member || rows[0].memberships !== 1n) throw new Error();
    const tables = await options.prisma.$queryRaw<{ name: string; owner: string; rls: boolean; select: boolean }[]>`
      SELECT c.relname AS name, pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity AS rls,
        has_table_privilege(current_user,c.oid,'SELECT') AS select
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN
        ('identity','session','household','household_member','consent','subscription','subscription_share')
      ORDER BY c.relname`;
    if (tables.length !== TABLES.length || tables.some((table, index) =>
      table.name !== TABLES[index] || table.owner !== 'fixture_owner' || !table.rls || !table.select)) throw new Error();
  } catch {
    // Prisma errors can include credentials and database URLs.
    throw new Error('Subscription read storage preflight denied');
  }
}

export async function createSubscriptionReadApp(options: SubscriptionReadCompositionOptions): Promise<{
  readonly app: INestApplication;
  listen(port: number): Promise<void>;
  close(): Promise<void>;
}> {
  await bounded(assertSubscriptionReadStorage(options), STARTUP_MS);
  const resolver = new PrincipalResolver(options.verifier, new PrismaSessionOwnerReader(options.prisma));
  const guard = new AuthenticatedPrincipalGuard(resolver);
  const service = new SubscriptionReadService(new SubscriptionReadRepository(options.prisma));
  class SubscriptionReadModule {}
  const module: DynamicModule = {
    module: SubscriptionReadModule,
    controllers: [SubscriptionReadController],
    providers: [
      { provide: APP_GUARD, useValue: guard },
      { provide: SubscriptionReadService, useValue: service },
    ],
  };
  const creating = NestFactory.create(module, { logger: false });
  let app: INestApplication;
  try {
    app = await bounded(creating, STARTUP_MS);
  } catch {
    void creating.then(late => closeApp(late).catch(() => undefined), () => undefined);
    throw new Error('Subscription read startup denied');
  }
  const initializing = app.init();
  try {
    await bounded(initializing, STARTUP_MS);
  } catch {
    // A timed-out init can still finish after close; release anything it starts late.
    void initializing.then(() => closeApp(app).catch(() => undefined), () => undefined);
    await closeApp(app).catch(() => undefined);
    throw new Error('Subscription read startup denied');
  }
  return {
    app,
    async listen(port: number) {
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Subscription read port denied');
      await app.listen(port, '127.0.0.1');
    },
    close: () => closeApp(app),
  };
}
