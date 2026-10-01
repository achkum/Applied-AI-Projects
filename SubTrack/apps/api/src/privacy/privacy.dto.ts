import { z } from 'zod';

// ─── Request bodies ───────────────────────────────────────────────────────────

export const SetOpenBookSchema = z.object({
  householdId: z.string().uuid(),
  /** Default is OFF per product spec. */
  openBook: z.boolean(),
});

export type SetOpenBookBody = z.infer<typeof SetOpenBookSchema>;

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface ConsentSetting {
  householdId: string;
  openBook: boolean;
  updatedAt: string;
}

/**
 * Safe subscription summary returned by the preview endpoint.
 * Never includes raw transactions, balances, account numbers, or PII (AC3).
 */
export interface SubscriptionSummary {
  id: string;
  customName: string | null;
  categoryCode: string;
  cadence: string;
  status: string;
  /** Always-private flag visible only to the subscription owner. */
  alwaysPrivate?: boolean;
}
