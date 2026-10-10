import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
  withRequestTransaction,
  type RequestContext,
} from '../../database/request-transaction';
import type {
  CurrentSessionOwnerSnapshot,
  SessionOwnerReader,
} from './principal-resolver';

const rowsSchema = z
  .array(
    z
      .object({
        sessionId: z.string().min(1),
        identityId: z.string().min(1),
        revokedAt: z.date().nullable(),
        ownerId: z.string().min(1),
        deletedAt: z.date().nullable(),
      })
      .strict(),
  )
  .max(1);

/** Internal adapter only: signed identifiers scope a lookup, not authorization. */
export class PrismaSessionOwnerReader implements SessionOwnerReader {
  constructor(private readonly prisma: Pick<PrismaClient, '$transaction'>) {}

  async readCurrentSessionOwner(
    sessionId: string,
    context: Readonly<RequestContext>,
  ): Promise<CurrentSessionOwnerSnapshot | null> {
    try {
      const userId = context.userId;
      return await withRequestTransaction(
        this.prisma,
        { userId },
        async (tx) => {
          const rows: unknown = await tx.$queryRaw`
          SELECT s.id::text AS "sessionId", s.identity_id::text AS "identityId",
                 s.revoked_at AS "revokedAt", i.id::text AS "ownerId",
                 i.deleted_at AS "deletedAt"
          FROM "session" s JOIN "identity" i ON i.id = s.identity_id
          WHERE s.id = ${sessionId}::uuid AND s.identity_id = ${userId}::uuid
        `;
          const parsed = rowsSchema.parse(rows);
          const row = parsed[0];
          if (!row) return null;
          if (
            row.sessionId !== sessionId ||
            row.identityId !== userId ||
            row.ownerId !== userId
          ) {
            throw new Error();
          }
          return {
            session: {
              id: row.sessionId,
              identityId: row.identityId,
              revokedAt: row.revokedAt,
            },
            identity: { id: row.ownerId, deletedAt: row.deletedAt },
          };
        },
      );
    } catch {
      throw new Error('Session owner lookup failed');
    }
  }
}
