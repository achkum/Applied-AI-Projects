/**
 * Categories of financial data that a member might try to access.
 * AC2: TRANSACTION, BALANCE, ACCOUNT_NUMBER, and NON_SUBSCRIPTION are
 * always private and can never be shared regardless of household or share state.
 */
export type DataCategory =
  | 'SUBSCRIPTION'
  | 'TRANSACTION'
  | 'BALANCE'
  | 'ACCOUNT_NUMBER'
  | 'NON_SUBSCRIPTION';

const ALWAYS_PRIVATE: ReadonlySet<DataCategory> = new Set([
  'TRANSACTION',
  'BALANCE',
  'ACCOUNT_NUMBER',
  'NON_SUBSCRIPTION',
]);

/** Returns true only for SUBSCRIPTION; all banking/raw data categories return false. */
export function isSharableCategory(category: DataCategory): boolean {
  return !ALWAYS_PRIVATE.has(category);
}
