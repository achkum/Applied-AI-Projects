import type {
  HouseholdMembership,
  SubscriptionShare,
  SubscriptionVisibilityContext,
} from './types.js';

/** Return active (not-left) memberships. */
function activeMemberships(ms: HouseholdMembership[]): HouseholdMembership[] {
  return ms.filter((m) => m.leftAt === null);
}

/** Return active (not-revoked) shares. */
function activeShares(shares: SubscriptionShare[]): SubscriptionShare[] {
  return shares.filter((s) => s.revokedAt === null);
}

/**
 * Return true if the viewer may read a specific subscription.
 *
 * Grant conditions (evaluated in order — first match wins):
 *  1. Viewer IS the owner.
 *  2. Viewer has an active explicit share for this subscription (ST-102).
 *  3. Viewer and owner share an active household, the owner's open-book
 *     consent is true for that household, and the subscription is NOT
 *     marked always-private.
 *
 * All other cases: DENY.
 */
export function canViewSubscription(
  viewerId: string,
  ctx: SubscriptionVisibilityContext,
): boolean {
  // Rule 1: owner always sees own subscription
  if (viewerId === ctx.ownerId) return true;

  // Rule 2: active explicit share
  const hasShare = activeShares(ctx.shares).some(
    (s) => s.ownerId === ctx.ownerId && s.recipientId === viewerId,
  );
  if (hasShare) return true;

  // Rule 3: household open-book path
  if (ctx.alwaysPrivate) return false;

  const viewerHouseholds = new Set(
    activeMemberships(ctx.viewerMemberships).map((m) => m.householdId),
  );

  for (const ownerMembership of activeMemberships(ctx.ownerMemberships)) {
    const sharedHousehold = ownerMembership.householdId;
    if (!viewerHouseholds.has(sharedHousehold)) continue;

    // Check owner's open-book consent for this household
    const consent = ctx.ownerConsents.find(
      (c) => c.identityId === ctx.ownerId && c.householdId === sharedHousehold,
    );
    if (consent?.openBook === true) return true;
  }

  return false;
}

/**
 * Return true if the viewer may read banking data (transactions, balances,
 * full account numbers) for a given owner.
 *
 * Per ASSUMPTIONS.md §A2: banking data is NEVER shared — even between
 * household members, even with open-book enabled.
 */
export function canViewBankingData(viewerId: string, ownerId: string): boolean {
  return viewerId === ownerId;
}

/**
 * Return true if the viewer may read audit-log entries scoped to a given household.
 *
 * Audit log is readable only by active household admins.
 */
export function canReadAuditLog(
  viewerId: string,
  householdId: string,
  viewerMemberships: HouseholdMembership[],
): boolean {
  return activeMemberships(viewerMemberships).some(
    (m) =>
      m.identityId === viewerId &&
      m.householdId === householdId &&
      m.role === 'ADMIN',
  );
}
