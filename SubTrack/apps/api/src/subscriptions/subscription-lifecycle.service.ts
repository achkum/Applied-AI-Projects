import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { RequestContext } from '../database/request-transaction';
import { SubscriptionLifecycleRepository } from './subscription-lifecycle.repository';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTION = { ACTIVE: 'resume', PAUSED: 'pause', CANCELLED: 'cancel', ARCHIVED: 'archive' } as const;

function invalid(): never { throw new BadRequestException('INVALID_SUBSCRIPTION_LIFECYCLE'); }

export class SubscriptionLifecycleService {
  constructor(private readonly repository: SubscriptionLifecycleRepository) {}

  async update(context: Readonly<RequestContext>, id: unknown, body: unknown) {
    if (typeof id !== 'string' || !UUID.test(id) || id.length > 36) invalid();
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.getPrototypeOf(body) !== Object.prototype) invalid();
    const fields = Object.keys(body);
    if (fields.length !== 1 || fields[0] !== 'status') invalid();
    const status: unknown = (body as Record<string, unknown>)['status'];
    if (typeof status !== 'string' || !Object.prototype.hasOwnProperty.call(ACTION, status)) invalid();
    try {
      return await this.repository.apply(context, id.toLowerCase(), ACTION[status as keyof typeof ACTION]);
    } catch (error) {
      if (error instanceof Error && error.message === 'SUBSCRIPTION_NOT_FOUND')
        throw new NotFoundException('SUBSCRIPTION_NOT_FOUND');
      if (error instanceof Error && error.message === 'LIFECYCLE_CONFLICT')
        throw new ConflictException('LIFECYCLE_CONFLICT');
      throw error;
    }
  }
}
