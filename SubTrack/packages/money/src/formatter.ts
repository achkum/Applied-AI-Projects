export type MoneyLocale = 'sv' | 'en';
export type CurrencyDisplay = 'symbol' | 'code' | 'name' | 'narrowSymbol';

export interface FormatMoneyOptions {
  locale?: MoneyLocale;
  display?: CurrencyDisplay;
}

const BCP47: Record<MoneyLocale, string> = {
  sv: 'sv-SE',
  en: 'en-SE',
};

/**
 * Format a minor-unit integer amount (e.g. öre for SEK, cents for EUR/USD)
 * as a locale-aware currency string.
 *
 * Uses Intl.NumberFormat so the correct fraction-digit count is derived from
 * the currency code automatically (2 for SEK/EUR/USD, 0 for JPY/KRW, …).
 */
export function formatMoney(
  minorUnits: number,
  currencyCode: string,
  options?: FormatMoneyOptions,
): string {
  const locale = options?.locale ?? 'sv';
  const display = options?.display ?? 'symbol';

  const formatter = new Intl.NumberFormat(BCP47[locale], {
    style: 'currency',
    currency: currencyCode,
    currencyDisplay: display,
  });

  const { maximumFractionDigits } = formatter.resolvedOptions();
  const divisor = Math.pow(10, maximumFractionDigits);

  return formatter.format(minorUnits / divisor);
}

/**
 * Return the minor-unit exponent for a currency (2 for SEK/EUR/USD, 0 for JPY).
 * Uses Intl.NumberFormat to avoid a hand-maintained lookup table.
 */
export function minorUnitExponent(currencyCode: string): number {
  const formatter = new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: currencyCode,
  });
  return formatter.resolvedOptions().maximumFractionDigits;
}
