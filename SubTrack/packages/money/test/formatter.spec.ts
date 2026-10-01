import { describe, it, expect } from 'vitest';
import { formatMoney, minorUnitExponent } from '../src/index.js';

describe('formatMoney', () => {
  it('formats SEK in Swedish locale by default', () => {
    const result = formatMoney(14900, 'SEK');
    // 14900 öre = 149.00 kr; symbol and number must both appear
    expect(result).toContain('149');
    expect(result.toLowerCase()).toContain('kr');
  });

  it('formats SEK in English locale', () => {
    const result = formatMoney(14900, 'SEK', { locale: 'en' });
    expect(result).toContain('149');
    expect(result).toMatch(/SEK|kr/);
  });

  it('formats EUR correctly', () => {
    const result = formatMoney(999, 'EUR', { locale: 'sv' });
    expect(result).toContain('9,99');
  });

  it('formats JPY with zero fractional digits', () => {
    // JPY has no minor unit — 500 JPY minor units = 500 JPY
    const result = formatMoney(500, 'JPY', { locale: 'en' });
    expect(result).toContain('500');
    expect(result).not.toContain('.');
  });

  it('displays currency code when display=code', () => {
    const result = formatMoney(14900, 'SEK', { display: 'code' });
    expect(result).toContain('SEK');
  });

  it('formats zero correctly', () => {
    const result = formatMoney(0, 'SEK');
    expect(result).toContain('0');
  });

  it('formats negative amounts correctly', () => {
    const result = formatMoney(-5000, 'SEK');
    expect(result).toContain('50');
    expect(result).toMatch(/-|−/); // minus or en-dash depending on locale
  });

  it('formats USD in Swedish locale', () => {
    const result = formatMoney(999, 'USD', { locale: 'sv' });
    expect(result).toContain('9,99');
  });
});

describe('minorUnitExponent', () => {
  it('returns 2 for SEK', () => {
    expect(minorUnitExponent('SEK')).toBe(2);
  });

  it('returns 2 for EUR', () => {
    expect(minorUnitExponent('EUR')).toBe(2);
  });

  it('returns 2 for USD', () => {
    expect(minorUnitExponent('USD')).toBe(2);
  });

  it('returns 0 for JPY', () => {
    expect(minorUnitExponent('JPY')).toBe(0);
  });
});
