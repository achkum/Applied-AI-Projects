import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { HttpException, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedPrincipalGuard } from '../auth/sessions/authenticated-principal.guard';
import { SubscriptionReadController } from './subscription-read.controller';
import { SubscriptionReadService } from './subscription-read.service';

const principal = { identityId: '11111111-1111-4111-8111-111111111111', sessionId: '22222222-2222-4222-8222-222222222222' };
let app: INestApplication | undefined;
afterEach(async () => { await app?.close(); app = undefined; });

async function setup(realService = false) {
  const resolve = vi.fn(async (token: string) => {
    if (token !== 'valid') throw new Error('invalid');
    return principal;
  });
  const list = vi.fn(async (context: unknown, query: unknown, inbox?: boolean) => { void context; void query; void inbox; return { items: [], nextCursor: null }; });
  const detail = vi.fn(async (context: unknown, id: unknown) => { void context; void id; return { visibility: 'owner', id: 'row' }; });
  const module = await Test.createTestingModule({
    controllers: [SubscriptionReadController],
    providers: [
      { provide: SubscriptionReadService, useValue: realService
        ? new SubscriptionReadService({ list: vi.fn(async () => []), detail: vi.fn(async () => null) } as never)
        : { list, detail } },
      { provide: APP_GUARD, useValue: new AuthenticatedPrincipalGuard({ resolve }) },
    ],
  }).compile();
  app = module.createNestApplication();
  await app.init();
  return { server: app.getHttpServer() as Parameters<typeof request>[0], resolve, list, detail };
}

describe('test-only subscription HTTP controller', () => {
  it('accepts Express null-prototype query records through the real service and rejects unknown keys', async () => {
    const { server } = await setup(true);
    await request(server).get('/v1/subscriptions?scope=household&limit=1')
      .set('Authorization', 'Bearer valid').expect(200);
    await request(server).get('/v1/subscriptions?scope=household&ownerId=spoof')
      .set('Authorization', 'Bearer valid').expect(400);
  });

  it('takes context only from the guard and denies spoofed or missing credentials', async () => {
    const { server, list, resolve } = await setup();
    await request(server).get('/v1/subscriptions').set('Authorization', 'Bearer valid').set('X-Caller-Id', 'spoof').expect(200);
    expect(list.mock.calls[0]?.[0]).toEqual({ userId: principal.identityId });
    await request(server).get('/v1/subscriptions').set('Authorization', 'Bearer invalid').expect(401);
    await request(server).get('/v1/subscriptions').expect(401);
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('uses stable problem shape and rejects detail query selectors', async () => {
    const { server, detail } = await setup();
    const response = await request(server).get('/v1/subscriptions/33333333-3333-4333-8333-333333333333?ownerId=spoof')
      .set('Authorization', 'Bearer valid').expect(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toEqual({ type: 'about:blank', title: 'Bad Request', status: 400, code: 'INVALID_SUBSCRIPTION_QUERY' });
    expect(detail).not.toHaveBeenCalled();
  });

  it('serves detail and inbox only with verified context', async () => {
    const { server, list, detail } = await setup();
    await request(server).get('/v1/subscriptions/33333333-3333-4333-8333-333333333333')
      .set('Authorization', 'Bearer valid').expect(200);
    await request(server).get('/v1/review-inbox')
      .set('Authorization', 'Bearer valid').expect(200);
    expect(detail.mock.calls[0]?.[0]).toEqual({ userId: principal.identityId });
    expect(list.mock.calls[0]?.[2]).toBe(true);
  });

  it('maps missing rows and unexpected service failures to stable problem responses', async () => {
    const { server, detail, list } = await setup();
    detail.mockRejectedValueOnce(new HttpException('missing', 404));
    await request(server).get('/v1/subscriptions/33333333-3333-4333-8333-333333333333')
      .set('Authorization', 'Bearer valid').expect(404, {
        type: 'about:blank', title: 'Not Found', status: 404, code: 'SUBSCRIPTION_NOT_FOUND',
      });
    list.mockRejectedValueOnce(new Error('synthetic failure'));
    await request(server).get('/v1/subscriptions').set('Authorization', 'Bearer valid').expect(500, {
      type: 'about:blank', title: 'Internal Server Error', status: 500, code: 'SUBSCRIPTION_READ_FAILED',
    });
  });
});
