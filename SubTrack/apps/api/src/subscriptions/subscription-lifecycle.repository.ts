import { Prisma, type PrismaClient } from '@prisma/client';
import { getNextSubscriptionStatus, type SubscriptionLifecycleAction, type SubscriptionLifecycleStatus } from '@subtrack/domain/subscription-lifecycle';
import { withRequestTransaction, type RequestContext } from '../database/request-transaction';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const missing = () => new Error('SUBSCRIPTION_NOT_FOUND');
const conflict = () => new Error('LIFECYCLE_CONFLICT');

export interface LifecycleResult {
  readonly id: string;
  readonly status: 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'ARCHIVED';
}

/** Private storage seam. Caller supplies an independently authenticated current principal. */
export class SubscriptionLifecycleRepository {
  constructor(private readonly prisma: Pick<PrismaClient, '$transaction'>) {}

  async apply(context: Readonly<RequestContext>, id: string, action: SubscriptionLifecycleAction): Promise<LifecycleResult> {
    const principal = context?.userId;
    if (typeof principal !== 'string' || !uuid.test(principal)) throw missing();
    if (typeof id !== 'string' || !uuid.test(id)) throw missing();
    if (action !== 'pause' && action !== 'resume' && action !== 'cancel' && action !== 'archive') throw conflict();
    try {
      return await withRequestTransaction(this.prisma, { userId: principal }, async tx => {
        const rows = await tx.$queryRaw<{ id: string; identityId: string; status: string }[]>(Prisma.sql`
          SELECT id::text, identity_id::text AS "identityId", status::text
          FROM subscription WHERE id = ${id}::uuid AND identity_id = ${principal}::uuid
          FOR UPDATE`);
        const row = rows[0];
        if (!row || rows.length !== 1 || row.id !== id.toLowerCase() || row.identityId !== principal.toLowerCase()) throw missing();
        const next = getNextSubscriptionStatus(row.status as SubscriptionLifecycleStatus, action);
        // Only the UF-08 owner actions are admitted, even if the shared core expands.
        if (row.status !== 'ACTIVE' && row.status !== 'PAUSED' && row.status !== 'CANCELLED') throw conflict();
        const updated = await tx.$queryRaw<{ id: string; status: LifecycleResult['status'] }[]>(Prisma.sql`
          UPDATE subscription SET status = ${next}::subscription_status, updated_at = NOW()
          WHERE id = ${id}::uuid AND identity_id = ${principal}::uuid
            AND status = ${row.status}::subscription_status
          RETURNING id::text, status::text`);
        if (updated.length !== 1 || updated[0]?.id !== id.toLowerCase() || updated[0]?.status !== next) throw conflict();
        return { id: updated[0].id, status: updated[0].status };
      });
    } catch (error) {
      if (error instanceof Error && (error.message === 'SUBSCRIPTION_NOT_FOUND' || error.message === 'LIFECYCLE_CONFLICT')) throw error;
      throw new Error('SUBSCRIPTION_STORAGE_ERROR');
    }
  }
}
