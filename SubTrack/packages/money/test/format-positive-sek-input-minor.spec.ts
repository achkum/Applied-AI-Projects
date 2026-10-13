import { describe, expect, it } from 'vitest';
import { formatPositiveSekInputMinor } from '../src/format-positive-sek-input-minor.js';
import { parsePositiveSekInput } from '../src/parse-positive-sek-input.js';

describe('editable positive SEK formatting', () => {
  it.each(['sv', 'en'] as const)('formats and roundtrips exact ungrouped amounts in %s', locale => {
    const separator = locale === 'sv' ? ',' : '.';
    for (const [minor, major, fraction] of [[1n, '0', '01'], [100n, '1', '00'], [12345n, '123', '45'],
      [9007199254740993n, '90071992547409', '93'], [9223372036854775807n, '92233720368547758', '07']] as const) {
      const formatted = formatPositiveSekInputMinor(minor, locale);
      expect(formatted).toBe(`${major}${separator}${fraction}`);
      expect(parsePositiveSekInput(formatted, locale)).toBe(minor);
    }
  });
  it('rejects invalid runtime arguments with fixed input-free errors', () => {
    for (const [minor, locale] of [[null, 'sv'], [1, 'en'], [1n, 'xx'], [0n, 'sv'], [-1n, 'en'],
      [9223372036854775808n, 'sv']] as const) {
      expect(() => formatPositiveSekInputMinor(minor as bigint, locale as 'sv')).toThrow(new RangeError('Invalid positive SEK amount'));
    }
  });
});
