import type { OrbitSubscription } from '@subtrack/ui';
import { catalogs, type Locale } from '@subtrack/i18n';

/** Fictional visual fixture only; this is not an API response or permission model. */
export const HOME_MOCK_SUBSCRIPTIONS: OrbitSubscription[] = [
  { id: 'netflix', name: 'Netflix', category: 'streaming', ownerType: 'ME', monthlyCostMinor: 13900, billingCadence: 'MONTHLY' },
  { id: 'spotify', name: 'Spotify', category: 'music', ownerType: 'ME', monthlyCostMinor: 9900, billingCadence: 'MONTHLY' },
  { id: 'gh', name: 'GitHub', category: 'productivity', ownerType: 'ME', monthlyCostMinor: 8800, billingCadence: 'ANNUAL' },
  { id: 'icloud', name: 'iCloud', category: 'cloud', ownerType: 'HOUSEHOLD', monthlyCostMinor: 2900, billingCadence: 'MONTHLY' },
  { id: 'hbo', name: 'HBO Max', category: 'streaming', ownerType: 'HOUSEHOLD', monthlyCostMinor: 11900, billingCadence: 'MONTHLY' },
];

export const HOME_MOCK_TOTALS = {
  me: { monthly: 32600, projection: 391200 },
  household: { monthly: 47400, projection: 568800 },
} as const;

const AMOUNT_LABELS: Record<string, string> = {
  netflix: '139 kr',
  spotify: '99 kr',
  gh: '88 kr',
  icloud: '29 kr',
  hbo: '119 kr',
};

export function homeMockPresentation(locale: Locale) {
  const catalog = catalogs[locale];
  return Object.fromEntries(HOME_MOCK_SUBSCRIPTIONS.map((subscription) => [subscription.id, {
    categoryLabel: catalog.orbit.categoryLabels[subscription.category as keyof typeof catalog.orbit.categoryLabels],
    amountLabel: `${AMOUNT_LABELS[subscription.id]} ${catalog.orbit.monthlyEquivalent}`,
    cadenceLabel: catalog.orbit.billingCadence[subscription.billingCadence],
    ownerLabel: catalog.orbit.ownerType[subscription.ownerType],
  }]));
}
