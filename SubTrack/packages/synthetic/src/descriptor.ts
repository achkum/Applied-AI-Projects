import type { Rng } from './rng.js';

/**
 * A transaction descriptor as it would appear on a bank statement,
 * paired with its canonical merchant name.
 */
export interface TransactionDescriptor {
  raw: string;
  canonical: string;
}

/**
 * Common descriptor mutation patterns seen in real Swedish bank data.
 * These produce realistic-looking statement text for synthetic transactions.
 */
const MUTATIONS = [
  (name: string) => name.toUpperCase(),
  (name: string) => name,
  (name: string) => `${name.toUpperCase()}*`,
  (name: string) => `${name.toUpperCase()}.COM`,
  (name: string) => `${name.toUpperCase()} SE`,
  (name: string) => `${name.toUpperCase()} AB`,
  (name: string) => `${name.toUpperCase()} NORDIC`,
  (name: string) => `${name.toUpperCase()} SWEDEN`,
  (name: string) => `${name.toUpperCase()} DIGITAL`,
  (name: string) => name.replace(/\s+/g, '').toUpperCase(),
  (name: string) => `${name.split(' ')[0]?.toUpperCase() ?? name.toUpperCase()}`,
  (name: string) => `${name.toUpperCase()} - ${new Date().getFullYear()}`,
] as const;

/**
 * Generate `count` distinct realistic descriptor variants for a canonical name.
 * The list is deterministic given the same `rng` state and `canonicalName`.
 */
export function generateDescriptors(
  canonicalName: string,
  rng: Rng,
  count = 3,
): TransactionDescriptor[] {
  if (count <= 0) return [];

  const mutationPool = rng.shuffle(MUTATIONS as unknown as Array<(n: string) => string>);
  const seen = new Set<string>();
  const results: TransactionDescriptor[] = [];

  for (const mutate of mutationPool) {
    if (results.length >= count) break;
    const raw = mutate(canonicalName);
    if (!seen.has(raw)) {
      seen.add(raw);
      results.push({ raw, canonical: canonicalName });
    }
  }

  // Fill up with numbered variants if the pool was exhausted
  let suffix = 1;
  while (results.length < count) {
    const raw = `${canonicalName.toUpperCase()}-${suffix++}`;
    if (!seen.has(raw)) {
      seen.add(raw);
      results.push({ raw, canonical: canonicalName });
    }
  }

  return results;
}

/**
 * Given a raw descriptor (e.g. "NETFLIX*"), return candidate canonical names
 * by stripping common suffixes and normalising case.
 */
export function normaliseDescriptor(raw: string): string {
  return raw
    .replace(/\*$/, '')
    .replace(/\.(COM|SE|NET|ORG)$/i, '')
    .replace(/\s+(AB|SE|NORDIC|SWEDEN|DIGITAL|ONLINE|PREMIUM)$/i, '')
    .replace(/\s*-\s*\d{4}$/, '')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
