export type MoneyLocale = 'sv' | 'en';
export type CurrencyDisplay = 'symbol' | 'code' | 'name' | 'narrowSymbol';

export interface FormatMoneyOptions {
  locale?: MoneyLocale;
  display?: CurrencyDisplay;
}

export type MinorUnitsCurrencyDisplay = 'symbol' | 'code' | 'narrowSymbol';

export interface FormatMinorUnitsOptions {
  locale?: MoneyLocale;
  display?: MinorUnitsCurrencyDisplay;
}

const BCP47: Record<MoneyLocale, string> = {
  sv: 'sv-SE',
  en: 'en-SE',
};

function checkedFractionDigits(value: number | undefined): number {
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || !Number.isInteger(value)
    || value < 0
  ) {
    throw new RangeError(
      'Intl.NumberFormat did not provide a valid maximumFractionDigits value',
    );
  }
  return value;
}

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

  const maximumFractionDigits = checkedFractionDigits(
    formatter.resolvedOptions().maximumFractionDigits,
  );
  const divisor = Math.pow(10, maximumFractionDigits);

  return formatter.format(minorUnits / divisor);
}

/** Format an exact integer amount in currency minor units. */
export function formatMinorUnits(
  minorUnits: bigint,
  currencyCode: string,
  options?: FormatMinorUnitsOptions,
): string {
  if (typeof minorUnits !== 'bigint') {
    throw new TypeError('minorUnits must be a bigint');
  }

  const locale = options?.locale ?? 'sv';
  if (locale !== 'sv' && locale !== 'en') {
    throw new RangeError('Unsupported money locale');
  }
  const display = options?.display ?? 'symbol';
  if (display !== 'symbol' && display !== 'code' && display !== 'narrowSymbol') {
    throw new RangeError('Unsupported currency display');
  }

  const tag = BCP47[locale];
  const currencyFormatter = new Intl.NumberFormat(tag, {
    style: 'currency',
    currency: currencyCode,
    currencyDisplay: display,
  });
  const digits = checkedFractionDigits(
    currencyFormatter.resolvedOptions().maximumFractionDigits,
  );
  const absolute = minorUnits < 0n ? -minorUnits : minorUnits;
  const scale = 10n ** BigInt(digits);
  const whole = absolute / scale;
  const remainder = absolute % scale;
  const template = currencyFormatter.formatToParts(minorUnits < 0n ? -1n : 1n);
  const integerParts = new Intl.NumberFormat(tag, {
    useGrouping: true,
    maximumFractionDigits: 0,
  }).formatToParts(whole);
  const fractionParts = digits === 0
    ? []
    : new Intl.NumberFormat(tag, {
        useGrouping: false,
        minimumIntegerDigits: digits,
        maximumFractionDigits: 0,
      }).formatToParts(remainder);
  const localizedFraction = fractionParts
    .filter((part) => part.type === 'integer')
    .map((part) => part.value)
    .join('');
  return template.map((part) => {
    if (part.type === 'integer') {
      return integerParts
        .filter((integerPart) => integerPart.type === 'integer' || integerPart.type === 'group')
        .map((integerPart) => integerPart.value)
        .join('');
    }
    if (part.type === 'fraction') return localizedFraction;
    return part.value;
  }).join('');
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
  return checkedFractionDigits(formatter.resolvedOptions().maximumFractionDigits);
}
