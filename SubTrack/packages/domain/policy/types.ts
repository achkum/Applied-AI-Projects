export type MemberRole = 'ADMIN' | 'MEMBER';

export interface HouseholdMembership {
  identityId: string;
  householdId: string;
  role: MemberRole;
  /** null means the member is still active */
  leftAt: Date | null;
}

/**
 * An explicit subscription share — owner delegates read access to a specific recipient.
 * Implemented in ST-102; included here so the policy can be future-proof.
 */
export interface SubscriptionShare {
  ownerId: string;
  recipientId: string;
  /** null means the share is still active */
  revokedAt: Date | null;
}

/**
 * The per-member, per-household open-book preference (Consent table).
 * openBook=true means the member allows household peers to see their subscriptions.
 */
export interface OpenBookConsent {
  identityId: string;
  householdId: string;
  openBook: boolean;
}

/**
 * All context the policy needs to decide whether a viewer may see a subscription.
 */
export interface SubscriptionVisibilityContext {
  /** UUID of the subscription's owner */
  ownerId: string;
  /** Whether the owner marked this subscription always-private */
  alwaysPrivate: boolean;
  /** Explicit shares the owner has granted (from ST-102) */
  shares: SubscriptionShare[];
  /** Active household memberships of the subscription owner */
  ownerMemberships: HouseholdMembership[];
  /** Active household memberships of the viewer */
  viewerMemberships: HouseholdMembership[];
  /** Open-book consent rows for the owner across their households */
  ownerConsents: OpenBookConsent[];
}
