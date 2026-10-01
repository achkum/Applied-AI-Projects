import { Locale } from '@/types';

const INTL_LOCALE: Record<Locale, string> = {
  sv: 'sv-SE',
  en: 'en-US',
};

const CURRENCY_DISPLAY: Record<Locale, 'symbol' | 'code'> = {
  sv: 'symbol',
  en: 'code',
};

/**
 * Formats an integer minor-unit amount (e.g. öre/cents) as a locale-aware
 * currency string, matching the accepted spec examples
 * (sv: "1 390 kr", en: "SEK 1,390"). Pure presentation only — no rounding,
 * allocation, or other money arithmetic, which stays in `packages/money`
 * once implemented (currently an unbuilt scaffold; see ST-026 Progress
 * notes).
 */
export function formatMoney(
  minorUnits: number,
  currencyCode: string,
  locale: Locale,
): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: 'currency',
    currency: currencyCode,
    currencyDisplay: CURRENCY_DISPLAY[locale],
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
    .format(minorUnits / 100)
    .replace(/\u00A0/g, " ");
}
