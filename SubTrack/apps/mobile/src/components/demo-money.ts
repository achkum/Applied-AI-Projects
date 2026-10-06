import {
  assertSafeMinorUnits,
  formatMinorUnits,
  minorUnitExponent,
  type MoneyLocale,
} from '@subtrack/money';
import type { PersonaSubscription } from '@subtrack/synthetic';

export type DemoSubscription = Pick<
  PersonaSubscription,
  'id' | 'merchantName' | 'amountMinor' | 'currency' | 'billingCadence'
>;

export interface FormattedDemoSubscription extends DemoSubscription {
  formattedAmount: string;
}

type MinorUnitFormatter = typeof formatMinorUnits;

/**
 * Exercise the exact public formatter and BigInt-aware Intl behavior on the
 * current runtime before any fixture amount is formatted for display.
 */
export function supportsExactDemoMoney(
  locale: MoneyLocale,
  formatter: MinorUnitFormatter = formatMinorUnits,
): boolean {
  try {
    if (typeof BigInt !== 'function') return false;

    const tag = locale === 'sv' ? 'sv-SE' : 'en-SE';
    const exactInteger = '12345678901234567890';
    const intlParts = new Intl.NumberFormat(tag, {
      style: 'currency',
      currency: 'SEK',
    }).formatToParts(BigInt(exactInteger));
    const renderedInteger = intlParts
      .filter((part) => part.type === 'integer')
      .map((part) => part.value)
      .join('');
    if (renderedInteger !== exactInteger) return false;

    const largeOutput = formatter(BigInt('9007199254740993'), 'SEK', { locale });
    const negativeSubunitOutput = formatter(BigInt('-1'), 'SEK', { locale });
    const expectedLarge = '90\u00a0071\u00a0992\u00a0547\u00a0409,93\u00a0kr';
    const expectedNegative = locale === 'sv'
      ? '−0,01\u00a0kr'
      : '-0,01\u00a0kr';
    if (largeOutput !== expectedLarge || negativeSubunitOutput !== expectedNegative) return false;

    for (const [currency, exponent] of [['JPY', 0], ['SEK', 2], ['KWD', 3]] as const) {
      if (minorUnitExponent(currency) !== exponent) return false;
      const exponentProbe = formatter(BigInt('1234'), currency, { locale });
      const expectedExponentProbe = currency === 'JPY'
        ? locale === 'sv' ? '1\u00a0234\u00a0JPY' : '1\u00a0234\u00a0JP¥'
        : currency === 'SEK'
          ? '12,34\u00a0kr'
          : '1,234\u00a0KWD';
      if (exponentProbe !== expectedExponentProbe) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Converts the fixture's number minor units only after an explicit safe check. */
export function formatDemoSubscriptions(
  subscriptions: readonly DemoSubscription[],
  locale: MoneyLocale,
  formatter: MinorUnitFormatter = formatMinorUnits,
): FormattedDemoSubscription[] {
  return subscriptions.map((subscription) => {
    assertSafeMinorUnits(subscription.amountMinor);
    const amount = BigInt(subscription.amountMinor);
    return {
      ...subscription,
      formattedAmount: formatter(amount, subscription.currency, { locale }),
    };
  });
}
