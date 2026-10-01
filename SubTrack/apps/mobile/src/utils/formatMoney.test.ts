import { formatMoney } from './formatMoney';

describe('formatMoney', () => {
  it('formats SEK minor units for sv-SE per the accepted spec example', () => {
    expect(formatMoney(139000, 'SEK', 'sv')).toBe('1 390 kr');
  });

  it('formats SEK minor units for en per the accepted spec example', () => {
    expect(formatMoney(139000, 'SEK', 'en')).toBe('SEK 1,390');
  });

  it('does not perform arithmetic beyond minor-unit to major-unit conversion', () => {
    expect(formatMoney(0, 'SEK', 'en')).toBe('SEK 0');
  });
});
