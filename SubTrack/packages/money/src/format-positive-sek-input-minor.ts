/** Format positive signed-bigint SEK minor units as an exact editable amount. */
export function formatPositiveSekInputMinor(minor: bigint, locale: 'sv' | 'en'): string {
  if (typeof minor !== 'bigint' || !['sv', 'en'].includes(locale) || minor < 1n || minor > 9223372036854775807n)
    throw new RangeError('Invalid positive SEK amount');
  return `${minor / 100n}${locale === 'sv' ? ',' : '.'}${(minor % 100n).toString().padStart(2, '0')}`;
}
