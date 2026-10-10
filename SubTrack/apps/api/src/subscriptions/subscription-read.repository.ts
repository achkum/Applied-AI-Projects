import { Prisma, type PrismaClient } from '@prisma/client';
import { withRequestTransaction, type RequestContext } from '../database/request-transaction';

export interface ReadFilters {
  scope: 'me' | 'household';
  status: string | null;
  category: string | null;
  after: { createdAt: string; id: string } | null;
  limit: number;
}

export interface SubscriptionReadRow {
  id: string;
  identityId: string;
  merchantId: string | null;
  merchantName: string | null;
  catalogPlanId: string | null;
  customName: string | null;
  categoryCode: string;
  cadence: string;
  status: string;
  expectedAmountMinor: bigint;
  currency: string;
  nextChargeDate: Date | null;
  alwaysPrivate: boolean;
  confidence: Prisma.Decimal | null;
  detectionReasons: unknown;
  createdAt: string;
}

const columns = Prisma.sql`
  s.id::text AS id, s.identity_id::text AS "identityId",
  s.merchant_id::text AS "merchantId", m.canonical_name AS "merchantName",
  s.catalog_plan_id::text AS "catalogPlanId", s.custom_name AS "customName",
  s.category_code AS "categoryCode", s.cadence::text AS cadence,
  s.status::text AS status, s.expected_amount_minor AS "expectedAmountMinor",
  s.currency, s.next_charge_date AS "nextChargeDate",
  s.always_private AS "alwaysPrivate", s.confidence, s.detection_reasons AS "detectionReasons",
  to_char(s.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt"`;

/** RLS supplies the baseline visibility; these predicates narrow it before pagination. */
export class SubscriptionReadRepository {
  constructor(private readonly prisma: Pick<PrismaClient, '$transaction'>) {}

  async list(context: Readonly<RequestContext>, filters: ReadFilters, inbox: boolean): Promise<SubscriptionReadRow[]> {
    const userId = context.userId;
    return withRequestTransaction(this.prisma, context, async tx => {
      const where = inbox
        ? Prisma.sql`s.identity_id = ${userId}::uuid AND s.status = 'DETECTED'::subscription_status`
        : Prisma.sql`(s.identity_id = ${userId}::uuid OR s.status <> 'DETECTED'::subscription_status)
            AND (${filters.scope} = 'household' OR s.identity_id = ${userId}::uuid)
            AND (${filters.scope} = 'me' OR EXISTS (
              SELECT 1 FROM household_member viewer
              WHERE viewer.identity_id = ${userId}::uuid AND viewer.left_at IS NULL))
            AND (${filters.status}::text IS NULL OR s.status::text = ${filters.status})
            AND (${filters.category}::text IS NULL OR s.category_code = ${filters.category})`;
      const position = filters.after
        ? Prisma.sql`AND (s.created_at, s.id) < (${filters.after.createdAt}::timestamptz, ${filters.after.id}::uuid)`
        : Prisma.empty;
      return tx.$queryRaw<SubscriptionReadRow[]>(Prisma.sql`
        SELECT ${columns} FROM subscription s LEFT JOIN merchant m ON m.id = s.merchant_id
        WHERE ${where} ${position}
        ORDER BY s.created_at DESC, s.id DESC LIMIT ${filters.limit + 1}`);
    });
  }

  async detail(context: Readonly<RequestContext>, id: string): Promise<SubscriptionReadRow | null> {
    const userId = context.userId;
    return withRequestTransaction(this.prisma, context, async tx => {
      const rows = await tx.$queryRaw<SubscriptionReadRow[]>(Prisma.sql`
        SELECT ${columns} FROM subscription s LEFT JOIN merchant m ON m.id = s.merchant_id
        WHERE s.id = ${id}::uuid AND (s.identity_id = ${userId}::uuid OR s.status <> 'DETECTED'::subscription_status)
        LIMIT 1`);
      return rows[0] ?? null;
    });
  }
}
