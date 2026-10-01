import type { SubscriptionVisibilityContext, VisibilityDecision } from './types.js';

/**
 * Pure policy function — no I/O.
 *
 * Access is GRANTED iff at least one rule holds:
 *   Rule 1 — requester is the subscription owner.
 *   Rule 2 — there is an active explicit share in a household the requester belongs to.
 *   Rule 3 — owner has open_book consent in a household the requester also belongs to,
 *             and the subscription is not marked always_private.
 *
 * The PostgreSQL RLS USING clause on the subscription table mirrors this logic exactly;
 * see the AC3 parity test in __tests__/rls-parity.test.ts.
 */
export function evaluateSubscriptionVisibility(
  requesterId: string,
  ctx: SubscriptionVisibilityContext,
): VisibilityDecision {
  // Rule 1: owner always has access to their own subscription.
  if (requesterId === ctx.ownerId) {
    return 'GRANTED';
  }

  const requesterHouseholds = new Set(
    ctx.activeMemberships
      .filter(m => m.identityId === requesterId)
      .map(m => m.householdId),
  );

  // Rule 2: active explicit share in a household where requester is an active member.
  const hasShare = ctx.activeShares.some(
    s => s.subscriptionId === ctx.subscriptionId && requesterHouseholds.has(s.householdId),
  );
  if (hasShare) return 'GRANTED';

  // Rule 3: owner has open_book in a common household, subscription not always_private.
  if (!ctx.alwaysPrivate) {
    const ownerOpenBookHouseholds = new Set(
      ctx.activeMemberships
        .filter(m => m.identityId === ctx.ownerId && m.openBook)
        .map(m => m.householdId),
    );

    for (const hid of ownerOpenBookHouseholds) {
      if (requesterHouseholds.has(hid)) {
        return 'GRANTED';
      }
    }
  }

  return 'DENIED';
}
