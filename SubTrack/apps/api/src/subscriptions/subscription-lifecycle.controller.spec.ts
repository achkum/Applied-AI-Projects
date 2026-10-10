import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException,
  type ArgumentsHost } from '@nestjs/common';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { SubscriptionLifecycleController, SubscriptionLifecycleProblemFilter } from './subscription-lifecycle.controller';
import type { SubscriptionLifecycleService } from './subscription-lifecycle.service';

const id = '11111111-1111-4111-8111-111111111111';

describe('lifecycle controller request boundary', () => {
  it.each([
    ['/v1/subscriptions/' + id + '?ownerId=x', 'application/json'],
    ['/v1/subscriptions/' + id + '?__proto__[x]=y', 'application/json'],
    ['/v1/subscriptions/' + id, 'text/plain'],
    ['/v1/subscriptions/' + id, undefined],
  ])('rejects raw query or unsupported content type', (originalUrl, contentType) => {
    const update = vi.fn();
    const controller = new SubscriptionLifecycleController({ update } as unknown as SubscriptionLifecycleService);
    const request = { originalUrl, headers: { 'content-type': contentType } } as unknown as Request;
    expect(() => controller.update(request, id, { status: 'PAUSED' })).toThrow(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('bounded lifecycle problem projection', () => {
  it.each([
    [new BadRequestException(), 400, 'INVALID_SUBSCRIPTION_LIFECYCLE_REQUEST'],
    [new UnauthorizedException(), 401, 'AUTHENTICATION_REQUIRED'],
    [new NotFoundException(), 404, 'SUBSCRIPTION_NOT_FOUND'],
    [new ConflictException(), 409, 'LIFECYCLE_CONFLICT'],
    [new Error('private driver detail'), 500, 'INTERNAL_ERROR'],
    [{ type: 'entity.too.large', status: 413 }, 400, 'INVALID_SUBSCRIPTION_LIFECYCLE_REQUEST'],
    [{ type: 'charset.unsupported', status: 415 }, 400, 'INVALID_SUBSCRIPTION_LIFECYCLE_REQUEST'],
    [{ type: 'encoding.unsupported', status: 415 }, 400, 'INVALID_SUBSCRIPTION_LIFECYCLE_REQUEST'],
  ])('projects only status and code', (error, status, code) => {
    const json = vi.fn();
    const response = { status: vi.fn().mockReturnThis(), type: vi.fn().mockReturnThis(), json };
    const host = { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost;
    new SubscriptionLifecycleProblemFilter().catch(error, host);
    expect(response.status).toHaveBeenCalledWith(status);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ type: 'about:blank', status, code }));
    expect(JSON.stringify(json.mock.calls)).not.toContain('private driver detail');
  });
});
