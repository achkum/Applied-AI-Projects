import { describe, it, expect } from 'vitest';
import { formatMoney } from './formatMoney';

describe('formatMoney', () => {
  it('formats in sv-SE (space thousands separator, kr suffix)', () => {
    const result = formatMoney(139000, 'SEK', 'sv-SE');
    // "1 390 kr" — space is a narrow no-break space in sv-SE
    expect(result.replace(/\s/g, ' ')).toMatch(/1\s*390/);
    expect(result).toContain('kr');
  });

  it('formats in en-SE (contains the number 1390)', () => {
    const result = formatMoney(139000, 'SEK', 'en-SE');
    // en-SE formats with SEK or kr depending on platform; just verify the amount
    expect(result.replace(/\s/g, ' ')).toMatch(/1.?390/);
  });

  it('rounds to 0 decimal places', () => {
    const result = formatMoney(9950, 'SEK', 'sv-SE');
    expect(result).not.toContain(',');
    expect(result).not.toMatch(/\d+\.\d+/);
  });
});
