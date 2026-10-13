/** Parse an ungrouped, localized SEK major-unit input without floating point. */
export function parsePositiveSekInput(input: string, locale: 'sv' | 'en'): bigint {
  const invalid = () => new RangeError('Invalid positive SEK amount');
  if (typeof input !== 'string' || !['sv', 'en'].includes(locale)) throw invalid();
  const pattern = locale === 'sv' ? /^(0|[1-9][0-9]*)(?:,([0-9]{1,2}))?$/ : /^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/;
  const match = pattern.exec(input.trim());
  if (!match || match[1]!.length > 17) throw invalid();
  const minor = BigInt(`${match[1]}${(match[2] ?? '').padEnd(2, '0')}`);
  if (minor < 1n || minor > 9223372036854775807n) throw invalid();
  return minor;
}
