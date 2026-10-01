/** An active (not revoked) explicit share of a subscription into a household. */
export interface ActiveShare {
  subscriptionId: string;
  householdId: string;
}

/**
 * A single active household membership row (left_at IS NULL).
 * openBook is derived from Consent(open_book=true, scope_type='HOUSEHOLD', scope_id=householdId).
 */
export interface HouseholdMembership {
  identityId: string;
  householdId: string;
  openBook: boolean;
}

/** All data required to evaluate subscription visibility without database I/O. */
export interface SubscriptionVisibilityContext {
  subscriptionId: string;
  /** identity_id of the subscription owner (payer). */
  ownerId: string;
  /** S.always_private flag — overrides open_book for this specific subscription. */
  alwaysPrivate: boolean;
  /** Active rows from subscription_share (revoked_at IS NULL). */
  activeShares: ActiveShare[];
  /** Active rows from household_member (left_at IS NULL) with openBook resolved. */
  activeMemberships: HouseholdMembership[];
}

export type VisibilityDecision = 'GRANTED' | 'DENIED';
