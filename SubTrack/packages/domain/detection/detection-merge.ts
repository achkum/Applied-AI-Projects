import type { SubscriptionLifecycleStatus } from './subscription-lifecycle.js';

const mergeConflict = (): Error => new Error('MERGE_CONFLICT');

/**
 * Decide the bounded status snapshot for merging one detection into another.
 * This helper does not read or mutate records or establish authority to merge.
 */
export function getDetectionMergeDecision(
  sourceId: string,
  sourceStatus: SubscriptionLifecycleStatus,
  sourceCurrency: string,
  survivorId: string,
  survivorStatus: SubscriptionLifecycleStatus,
  survivorCurrency: string,
) {
  if (
    typeof sourceId !== 'string' ||
    typeof sourceStatus !== 'string' ||
    typeof sourceCurrency !== 'string' ||
    typeof survivorId !== 'string' ||
    typeof survivorStatus !== 'string' ||
    typeof survivorCurrency !== 'string'
  ) {
    throw mergeConflict();
  }

  if (
    sourceId.length === 0 ||
    survivorId.length === 0 ||
    sourceCurrency.length === 0 ||
    survivorCurrency.length === 0 ||
    sourceId === survivorId ||
    sourceStatus !== 'DETECTED' ||
    survivorStatus !== 'DETECTED' ||
    sourceCurrency !== survivorCurrency
  ) {
    throw mergeConflict();
  }

  return Object.freeze({
    sourceId,
    survivorId,
    sourceStatus: 'ARCHIVED' as const,
    survivorStatus: 'DETECTED' as const,
  });
}
