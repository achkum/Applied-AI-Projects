// Local formatter matching ST-023 spec format examples.
// Future: replace with packages/money consumer (ST-056).
export function formatMoney(
  amountMinor: number,
  currency: string,
  locale: 'sv-SE' | 'en-SE',
): string {
  const major = amountMinor / 100;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(major);
}
