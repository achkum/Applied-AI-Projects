import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { assertSubscriptionLifecycleStorage, createSubscriptionLifecycleApp,
  type SubscriptionLifecycleCompositionOptions } from './subscription-lifecycle.http-composition';

const identityId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const subscriptionId = '33333333-3333-4333-8333-333333333333';
const role = { database: 'subscription_lifecycle_proof', role: 'st216_runtime', login: true,
  superuser: false, bypass: false, member: true, memberships: 1n };
const names = ['consent', 'household', 'household_member', 'identity', 'session', 'subscription', 'subscription_share'];
const tables = names.map(name => ({ name, owner: 'fixture_owner', rls: true, select: true, update: name === 'subscription' }));

function fixture(rows: unknown = [role], relations: unknown = tables) {
  const query = vi.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce(relations);
  const options: SubscriptionLifecycleCompositionOptions = {
    prisma: { $queryRaw: query } as unknown as PrismaClient,
    verifier: { verify: vi.fn() }, developmentEnabled: true, host: '127.0.0.1',
    expectedDatabase: 'subscription_lifecycle_proof', expectedRole: 'st216_runtime',
  };
  return { options, query };
}

describe('lifecycle HTTP composition', () => {
  it('accepts only a numeric loopback listener and closes its app', async () => {
    const composition = await createSubscriptionLifecycleApp(fixture().options);
    const listening = vi.spyOn(composition.app, 'listen').mockResolvedValue(composition.app);
    try {
      await expect(composition.listen(0)).rejects.toThrow('Subscription lifecycle startup denied');
      expect(listening).not.toHaveBeenCalled();
      await composition.listen(34567);
      expect(listening).toHaveBeenCalledWith(34567, '127.0.0.1');
    } finally { await composition.close(); }
  });

  it('closes a Nest app that finishes creating after its startup deadline', async () => {
    vi.useFakeTimers();
    let resolveCreate!: (app: INestApplication) => void;
    const late = new Promise<INestApplication>(resolve => { resolveCreate = resolve; });
    const factory = vi.spyOn(NestFactory, 'create').mockReturnValue(late);
    const close = vi.fn(async () => { throw new Error('late close failed'); });
    try {
      const pending = createSubscriptionLifecycleApp(fixture().options);
      const rejected = expect(pending).rejects.toThrow('Subscription lifecycle startup denied');
      await vi.advanceTimersByTimeAsync(20_000);
      await rejected;
      resolveCreate({ close } as unknown as INestApplication);
      await Promise.resolve();
      await Promise.resolve();
      expect(close).toHaveBeenCalledOnce();
    } finally { factory.mockRestore(); vi.useRealTimers(); }
  });

  it('closes both immediately and after a late Nest initialization', async () => {
    vi.useFakeTimers();
    let resolveInit!: (app: INestApplication) => void;
    const close = vi.fn(async () => { throw new Error('close failed'); });
    const app = { useGlobalFilters: vi.fn(), init: vi.fn(() =>
      new Promise<INestApplication>(resolve => { resolveInit = resolve; })), close } as unknown as INestApplication;
    const factory = vi.spyOn(NestFactory, 'create').mockResolvedValue(app);
    try {
      const pending = createSubscriptionLifecycleApp(fixture().options);
      const rejected = expect(pending).rejects.toThrow('Subscription lifecycle startup denied');
      await vi.advanceTimersByTimeAsync(20_000);
      await rejected;
      expect(close).toHaveBeenCalledOnce();
      resolveInit(app);
      await Promise.resolve();
      await Promise.resolve();
      expect(close).toHaveBeenCalledTimes(2);
    } finally { factory.mockRestore(); vi.useRealTimers(); }
  });

  it('denies a rejected Nest creation without leaking its error', async () => {
    const factory = vi.spyOn(NestFactory, 'create').mockRejectedValue(new Error('private failure'));
    try {
      await expect(createSubscriptionLifecycleApp(fixture().options))
        .rejects.toThrow('Subscription lifecycle startup denied');
    } finally { factory.mockRestore(); }
  });

  it('exercises guard, current session, locked writer and bounded problem responses through Nest', async () => {
    const tx = { $executeRaw: vi.fn().mockResolvedValue(1), $queryRaw: vi.fn(async (query: { strings?: string[] } | TemplateStringsArray) => {
      const sql = String('strings' in query ? query.strings : query);
      if (sql.includes('FROM "session"')) return [{ sessionId, identityId, revokedAt: null, ownerId: identityId, deletedAt: null }];
      if (sql.includes('FROM subscription')) return [{ id: subscriptionId, identityId, status: 'ACTIVE' }];
      if (sql.includes('UPDATE subscription')) return [{ id: subscriptionId, status: 'PAUSED' }];
      throw new Error('Unexpected query');
    }) };
    const { options } = fixture();
    const verifier = { verify: vi.fn((token: string) => {
      if (token !== 'valid') throw new Error('bad token');
      return { sub: identityId, sid: sessionId, iat: 1, exp: 2 };
    }) };
    const prisma = { ...options.prisma, $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx)) } as unknown as PrismaClient;
    const composition = await createSubscriptionLifecycleApp({ ...options, prisma, verifier });
    const server = composition.app.getHttpServer() as Parameters<typeof request>[0];
    try {
      const endpoint = `/v1/subscriptions/${subscriptionId}`;
      const unauth = await request(server).patch(endpoint).send({ status: 'PAUSED' }).expect(401);
      expect(unauth.body).toEqual({ type: 'about:blank', title: 'Unauthorized', status: 401, code: 'AUTHENTICATION_REQUIRED' });
      await request(server).patch(endpoint).set('Authorization', 'Bearer invalid').send({ status: 'PAUSED' }).expect(401);
      const success = await request(server).patch(endpoint).set('Authorization', 'Bearer valid').send({ status: 'PAUSED' }).expect(200);
      expect(success.body).toEqual({ id: subscriptionId, status: 'PAUSED' });
      expect(tx.$executeRaw).toHaveBeenCalledTimes(4);
      expect(verifier.verify).toHaveBeenCalledWith('valid');
      for (const body of ['{"status":"PAUSED","status":"ACTIVE"}', '{"sta\\u0074us":"PAUSED","status":"ACTIVE"}',
        '{"status":"PAUSED","ownerId":"spoof"}', '{"status":']) {
        const bad = await request(server).patch(endpoint).set('Authorization', 'Bearer valid')
          .set('Content-Type', 'application/json').send(body).expect(400);
        expect(bad.body).toEqual({ type: 'about:blank', title: 'Bad Request', status: 400,
          code: 'INVALID_SUBSCRIPTION_LIFECYCLE_REQUEST' });
      }
      await request(server).patch(endpoint + '?ownerId=x').set('Authorization', 'Bearer valid')
        .send({ status: 'PAUSED' }).expect(400);
      await request(server).patch(endpoint).set('Authorization', 'Bearer valid')
        .set('Content-Type', 'text/plain').send('x').expect(400);
      for (const [contentType, payload] of [
        ['application/json; charset=iso-8859-1', '{"status":"PAUSED"}'],
        ['application/json', JSON.stringify({ status: 'A'.repeat(1_100_000) })],
      ] as [string, string][]) {
        const bad = await request(server).patch(endpoint).set('Authorization', 'Bearer valid')
          .set('Content-Type', contentType).send(payload).expect(400);
        expect(bad.body).toEqual({ type: 'about:blank', title: 'Bad Request', status: 400,
          code: 'INVALID_SUBSCRIPTION_LIFECYCLE_REQUEST' });
      }
    } finally { await composition.close(); }
  });

  it.each([
    ['wrong role', [{ ...role, role: 'fixture_owner' }], tables],
    ['superuser', [{ ...role, superuser: true }], tables],
    ['bypass', [{ ...role, bypass: true }], tables],
    ['extra membership', [{ ...role, memberships: 2n }], tables],
    ['no RLS', [role], tables.map((table, i) => i ? table : { ...table, rls: false })],
    ['no SELECT', [role], tables.map((table, i) => i ? table : { ...table, select: false })],
    ['no UPDATE', [role], tables.map(table => table.name === 'subscription' ? { ...table, update: false } : table)],
  ])('rejects %s before route creation', async (_name, roles, relations) => {
    await expect(assertSubscriptionLifecycleStorage(fixture(roles, relations).options))
      .rejects.toThrow('Subscription lifecycle storage preflight denied');
  });
  it.each([
    ['disabled', { developmentEnabled: false }], ['public host', { host: '0.0.0.0' }],
    ['wrong database', { expectedDatabase: 'persistent' }], ['wrong role', { expectedRole: 'fixture_owner' }],
  ])('denies %s without touching storage', async (_name, override) => {
    const { options, query } = fixture();
    await expect(assertSubscriptionLifecycleStorage({ ...options, ...override } as SubscriptionLifecycleCompositionOptions))
      .rejects.toThrow('Subscription lifecycle startup denied');
    expect(query).not.toHaveBeenCalled();
  });
});
