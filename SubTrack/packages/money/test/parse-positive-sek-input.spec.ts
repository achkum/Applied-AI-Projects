import { describe, expect, it } from 'vitest';
import { parsePositiveSekInput } from '../src/parse-positive-sek-input.js';

describe('positive SEK input', () => {
  it.each(['sv', 'en'] as const)('parses exact minor units in %s', locale => {
    const separator = locale === 'sv' ? ',' : '.';
    for (const [input, expected] of [['1', 100n], [' 12 ', 1200n], [`0${separator}01`, 1n], [`2${separator}1`, 210n],
      [`90071992547409${separator}93`, 9007199254740993n], [`92233720368547758${separator}07`, 9223372036854775807n]] as const)
      expect(parsePositiveSekInput(input, locale)).toBe(expected);
  });
  it.each(['sv', 'en'] as const)('rejects malformed, zero and overflow in %s without echoing input', locale => {
    const separator = locale === 'sv' ? ',' : '.';
    for (const input of ['', ' ', '0', `0${separator}00`, '00', `00${separator}01`, '01', '+1', '-1', '1e2',
      '1 000', "1'000", '1_000', '1,000.00', locale === 'sv' ? '1.01' : '1,01', `${separator}01`, `1${separator}`,
      `1${separator}001`, `92233720368547758${separator}08`, '100000000000000000', 'private-input']) {
      expect(() => parsePositiveSekInput(input, locale)).toThrow('Invalid positive SEK amount');
    }
  });
  it('rejects invalid runtime arguments', () => {
    expect(() => parsePositiveSekInput(null as unknown as string, 'sv')).toThrow('Invalid positive SEK amount');
    expect(() => parsePositiveSekInput('1', 'xx' as 'sv')).toThrow('Invalid positive SEK amount');
  });
});
