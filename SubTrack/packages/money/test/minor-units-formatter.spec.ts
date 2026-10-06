import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatMinorUnits,
  type FormatMinorUnitsOptions,
} from '../src/index.js';

afterEach(() => vi.restoreAllMocks());

describe('formatMinorUnits', () => {
  it('uses the Swedish symbol default and preserves negative subunits', () => {
    expect(formatMinorUnits(-1n, 'SEK')).toBe('−0,01 kr');
    expect(formatMinorUnits(1n, 'SEK')).toBe('0,01 kr');
    expect(formatMinorUnits(0n, 'SEK')).toBe('0,00 kr');
  });

  it('formats exact grouped values above the safe integer limit', () => {
    expect(formatMinorUnits(123456789012345678901n, 'SEK'))
      .toBe('1 234 567 890 123 456 789,01 kr');
  });

  it('supports English locale and each supported display', () => {
    expect(formatMinorUnits(123n, 'SEK', { locale: 'en' })).toBe('1,23 kr');
    expect(formatMinorUnits(123n, 'SEK', { display: 'code' })).toBe('1,23 SEK');
    expect(formatMinorUnits(123n, 'SEK', { display: 'narrowSymbol' })).toBe('1,23 kr');
  });

  it('formats zero and three digit currencies', () => {
    expect(formatMinorUnits(0n, 'JPY')).toBe('0 JPY');
    expect(formatMinorUnits(-1n, 'KWD')).toBe('−0,001 KWD');
    expect(formatMinorUnits(123456789012345678n, 'KWD'))
      .toBe('123 456 789 012 345,678 KWD');
  });

  it('preserves native invalid currency errors', () => {
    expect(() => formatMinorUnits(1n, 'INVALID')).toThrow(RangeError);
  });

  it('rejects non-bigint amounts without formatting the supplied value', () => {
    expect(() => formatMinorUnits('secret' as unknown as bigint, 'SEK'))
      .toThrowError(new TypeError('minorUnits must be a bigint'));
  });

  it('rejects unsupported runtime locale and display values', () => {
    expect(() => formatMinorUnits(1n, 'SEK', { locale: 'da' } as unknown as FormatMinorUnitsOptions))
      .toThrowError(new RangeError('Unsupported money locale'));
    expect(() => formatMinorUnits(1n, 'SEK', { display: 'name' } as unknown as FormatMinorUnitsOptions))
      .toThrowError(new RangeError('Unsupported currency display'));
    expect(() => formatMinorUnits(1n, 'SEK', { display: 'decimal' } as unknown as FormatMinorUnitsOptions))
      .toThrowError(new RangeError('Unsupported currency display'));
  });

  it('uses the existing checked metadata guard', () => {
    const nativeOptions = new Intl.NumberFormat('sv-SE', {
      style: 'currency', currency: 'SEK',
    }).resolvedOptions();
    const invalidOptions = { ...nativeOptions };
    Object.defineProperty(invalidOptions, 'maximumFractionDigits', { value: Number.NaN });
    vi.spyOn(Intl.NumberFormat.prototype, 'resolvedOptions').mockReturnValue(invalidOptions);

    expect(() => formatMinorUnits(1n, 'SEK')).toThrowError(
      new RangeError('Intl.NumberFormat did not provide a valid maximumFractionDigits value'),
    );
  });
});
