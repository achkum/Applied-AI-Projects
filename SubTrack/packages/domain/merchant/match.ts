import { normalizeMerchantDescriptor } from './normalize.js';

/** The narrow structural catalogue shape needed by merchant matching. */
export interface MerchantMatchCandidate {
  key: string;
  canonicalName: string;
  aliases: readonly string[];
}

export interface MerchantMatch {
  key: string;
  canonicalName: string;
  matchedBy: 'canonicalName' | 'alias';
}

/** Resolve only exact normalized canonical names and explicit aliases. */
export function matchMerchantDescriptor(
  descriptor: string,
  catalogue: readonly MerchantMatchCandidate[],
): MerchantMatch | null {
  const normalized = normalizeMerchantDescriptor(descriptor);
  if (!normalized) return null;

  const matches = new Map<string, MerchantMatch>();
  for (const merchant of catalogue) {
    if (normalizeMerchantDescriptor(merchant.canonicalName) === normalized) {
      matches.set(merchant.key, {
        key: merchant.key,
        canonicalName: merchant.canonicalName,
        matchedBy: 'canonicalName',
      });
    }
    for (const alias of merchant.aliases) {
      if (normalizeMerchantDescriptor(alias) === normalized && !matches.has(merchant.key)) {
        matches.set(merchant.key, {
          key: merchant.key,
          canonicalName: merchant.canonicalName,
          matchedBy: 'alias',
        });
      }
    }
  }

  return matches.size === 1 ? matches.values().next().value ?? null : null;
}
