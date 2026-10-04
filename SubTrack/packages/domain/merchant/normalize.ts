/** Normalize a transaction descriptor for exact, locale-independent comparisons. */
export function normalizeMerchantDescriptor(descriptor: string): string {
  return descriptor.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
}
