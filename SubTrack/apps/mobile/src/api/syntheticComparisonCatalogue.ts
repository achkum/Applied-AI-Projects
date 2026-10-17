import { ALL_PERSONAS } from '../../../../packages/synthetic/src/personas';
import type { ComparisonPlan } from './nativeAnalyticsProjection';

const categories: Readonly<Record<string, string>> = {
  'video-streaming': 'VIDEO_STREAMING', 'music-audio': 'MUSIC_AUDIO', 'cloud-storage': 'CLOUD_STORAGE',
  'software-productivity': 'SOFTWARE_PRODUCTIVITY', 'books-media': 'AUDIOBOOKS_EBOOKS',
  'health-wellness': 'FITNESS_WELLNESS', education: 'EDUCATION_KIDS',
};

/** Offline sample prices from the supplied deterministic bank personas.
 * Never advertised as verified/current market offers, eligibility or equivalent plan features.
 * Excludes ambiguous bundle/cloud-infrastructure slugs rather than guessing their category.
 */
export const syntheticComparisonCatalogue: readonly ComparisonPlan[] = (() => {
  const unique = new Map<string, ComparisonPlan>();
  for (const persona of ALL_PERSONAS) for (const row of persona.subscriptions) {
    const categoryCode = categories[row.category];
    if (!categoryCode) continue;
    const id = `fixture:${row.id}`;
    const key = `${row.merchantId}:${row.billingCadence}:${row.amountMinor}`;
    if (!unique.has(key)) unique.set(key, { id, name: row.merchantName, categoryCode, cadence: row.billingCadence,
      amountMinor: BigInt(row.amountMinor).toString(), currency: row.currency, source: 'synthetic-persona-fixture' });
  }
  return [...unique.values()];
})();
