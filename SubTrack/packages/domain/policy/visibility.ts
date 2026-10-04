import { evaluateSubscriptionVisibility } from './subscription-visibility.js';
import type { SubscriptionVisibilityContext } from './types.js';

/** Compatibility helper returning a boolean for the canonical household policy. */
export function canViewSubscription(
  viewerId: string,
  context: SubscriptionVisibilityContext,
): boolean {
  return evaluateSubscriptionVisibility(viewerId, context) === 'GRANTED';
}

/** Banking data is visible only to its owner, independent of subscription sharing. */
export function canViewBankingData(viewerId: string, ownerId: string): boolean {
  return viewerId === ownerId;
}

export interface AuditLogMembership {
  identityId: string;
  householdId: string;
  role: 'ADMIN' | 'MEMBER' | 'DEPENDANT';
  leftAt: Date | null;
}

/** Audit-log access remains limited to active admins of the requested household. */
export function canReadAuditLog(
  viewerId: string,
  householdId: string,
  memberships: readonly AuditLogMembership[],
): boolean {
  return memberships.some(
    membership => membership.identityId === viewerId
      && membership.householdId === householdId
      && membership.role === 'ADMIN'
      && membership.leftAt === null,
  );
}
