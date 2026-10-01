import { describe, it, expect } from 'vitest';
import { assertValidCurrencyCode, assertSafeMinorUnits, MoneyError } from '../src/index.js';

describe('assertValidCurrencyCode()', () => {
  it('accepts valid 3-letter codes', () => {
    expect(() => assertValidCurrencyCode('SEK')).not.toThrow();
    expect(() => assertValidCurrencyCode('EUR')).not.toThrow();
    expect(() => assertValidCurrencyCode('USD')).not.toThrow();
    expect(() => assertValidCurrencyCode('JPY')).not.toThrow();
  });

  it('rejects lowercase', () => {
    expect(() => assertValidCurrencyCode('sek')).toThrow(MoneyError);
  });

  it('rejects too-short code', () => {
    expect(() => assertValidCurrencyCode('SE')).toThrow(MoneyError);
  });

  it('rejects too-long code', () => {
    expect(() => assertValidCurrencyCode('SEKK')).toThrow(MoneyError);
  });

  it('rejects codes with digits', () => {
    expect(() => assertValidCurrencyCode('SE1')).toThrow(MoneyError);
  });

  it('rejects empty string', () => {
    expect(() => assertValidCurrencyCode('')).toThrow(MoneyError);
  });
});

describe('assertSafeMinorUnits()', () => {
  it('accepts safe integers', () => {
    expect(() => assertSafeMinorUnits(0)).not.toThrow();
    expect(() => assertSafeMinorUnits(14900)).not.toThrow();
    expect(() => assertSafeMinorUnits(-14900)).not.toThrow();
    expect(() => assertSafeMinorUnits(Number.MAX_SAFE_INTEGER)).not.toThrow();
  });

  it('rejects non-integer', () => {
    expect(() => assertSafeMinorUnits(1.5)).toThrow(MoneyError);
  });

  it('rejects value exceeding MAX_SAFE_INTEGER', () => {
    expect(() => assertSafeMinorUnits(Number.MAX_SAFE_INTEGER + 1)).toThrow(MoneyError);
  });
});
