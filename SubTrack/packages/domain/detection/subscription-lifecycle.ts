/** A subscription status accepted by the ordinary lifecycle decision core. */
export type SubscriptionLifecycleStatus =
  | 'DETECTED'
  | 'TRIAL'
  | 'ACTIVE'
  | 'PAUSED'
  | 'CANCELLED'
  | 'ARCHIVED'
  | 'REJECTED';

/** An ordinary lifecycle action accepted by the decision core. */
export type SubscriptionLifecycleAction =
  | 'confirm'
  | 'reject'
  | 'archive'
  | 'activate'
  | 'cancel'
  | 'pause'
  | 'resume';

const lifecycleConflict = (): Error => new Error('LIFECYCLE_CONFLICT');

/**
 * Calculate the next status for an explicitly supplied status and action.
 * This helper does not read or mutate a subscription or establish authority
 * to perform a transition.
 */
export function getNextSubscriptionStatus(
  currentStatus: SubscriptionLifecycleStatus,
  action: SubscriptionLifecycleAction,
): SubscriptionLifecycleStatus {
  if (typeof currentStatus !== 'string' || typeof action !== 'string') {
    throw lifecycleConflict();
  }

  if (currentStatus === 'DETECTED') {
    if (action === 'confirm') return 'ACTIVE';
    if (action === 'reject') return 'REJECTED';
    if (action === 'archive') return 'ARCHIVED';
  } else if (currentStatus === 'TRIAL') {
    if (action === 'activate') return 'ACTIVE';
    if (action === 'cancel') return 'CANCELLED';
    if (action === 'archive') return 'ARCHIVED';
  } else if (currentStatus === 'ACTIVE') {
    if (action === 'pause') return 'PAUSED';
    if (action === 'cancel') return 'CANCELLED';
    if (action === 'archive') return 'ARCHIVED';
  } else if (currentStatus === 'PAUSED') {
    if (action === 'resume') return 'ACTIVE';
    if (action === 'cancel') return 'CANCELLED';
    if (action === 'archive') return 'ARCHIVED';
  } else if (currentStatus === 'CANCELLED' || currentStatus === 'REJECTED') {
    if (action === 'archive') return 'ARCHIVED';
  }

  throw lifecycleConflict();
}
