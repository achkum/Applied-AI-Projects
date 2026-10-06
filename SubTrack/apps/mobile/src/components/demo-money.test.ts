import { PERSONA_LINDQVIST } from '@subtrack/synthetic';
import { formatMinorUnits } from '@subtrack/money';
import { formatDemoSubscriptions, supportsExactDemoMoney } from './demo-money';

describe('demo exact-money adapter', () => {
  it.each(['en', 'sv'] as const)('passes the runtime capability gate in %s', (locale) => {
    expect(supportsExactDemoMoney(locale)).toBe(true);
  });

  it('fails closed when capability formatting throws or returns unexpected output', () => {
    expect(supportsExactDemoMoney('en', () => { throw new Error('unsupported'); })).toBe(false);
    expect(supportsExactDemoMoney('sv', () => 'wrong')).toBe(false);
  });

  it('fails closed when BigInt is unavailable and restores the runtime global', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'BigInt');
    try {
      Object.defineProperty(globalThis, 'BigInt', { configurable: true, value: undefined });
      expect(supportsExactDemoMoney('en')).toBe(false);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'BigInt', descriptor);
    }
  });

  it('fails closed when Intl formatToParts throws or returns malformed parts', () => {
    const original = Intl.NumberFormat.prototype.formatToParts;
    const spy = jest.spyOn(Intl.NumberFormat.prototype, 'formatToParts');
    try {
      spy.mockImplementation(() => { throw new Error('formatToParts unavailable'); });
      expect(supportsExactDemoMoney('en')).toBe(false);

      spy.mockImplementation(() => [{ type: 'fraction', value: '0' }]);
      expect(supportsExactDemoMoney('sv')).toBe(false);
    } finally {
      spy.mockRestore();
      expect(Intl.NumberFormat.prototype.formatToParts).toBe(original);
    }
  });

  it('fails closed when formatter output disagrees with a currency exponent', () => {
    const mismatchedFormatter: typeof formatMinorUnits = (amount, currency, options) =>
      currency === 'JPY' ? '12.34 JP¥' : formatMinorUnits(amount, currency, options);
    expect(supportsExactDemoMoney('en', mismatchedFormatter)).toBe(false);
  });

  it('fails the BigInt Intl precision probe if integer digits are lost', () => {
    const original = Intl.NumberFormat.prototype.formatToParts;
    const spy = jest.spyOn(Intl.NumberFormat.prototype, 'formatToParts')
      .mockImplementation(function (this: Intl.NumberFormat, value?: number | bigint) {
        const parts = original.call(this, value);
        if (typeof value !== 'bigint') return parts;
        return parts.map((part) => part.type === 'integer' ? { ...part, value: '0' } : part);
      });
    try {
      expect(supportsExactDemoMoney('en')).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('checks zero-, two-, and three-digit currency cases with exact formatting', () => {
    expect(formatMinorUnits(BigInt('1234'), 'JPY', { locale: 'sv' })).toBe('1\u00a0234\u00a0JPY');
    expect(formatMinorUnits(BigInt('1234'), 'SEK', { locale: 'sv' })).toBe('12,34\u00a0kr');
    expect(formatMinorUnits(BigInt('1234'), 'KWD', { locale: 'sv' })).toBe('1,234\u00a0KWD');
  });

  it('adapts all six public Lindqvist fixture entries with source amounts and cadence', () => {
    const formatted = formatDemoSubscriptions(PERSONA_LINDQVIST.subscriptions, 'en');
    expect(formatted).toHaveLength(6);
    expect(formatted.map(({ id, amountMinor, billingCadence }) => ({ id, amountMinor, billingCadence })))
      .toEqual(PERSONA_LINDQVIST.subscriptions.map(({ id, amountMinor, billingCadence }) => ({ id, amountMinor, billingCadence })));
    expect(formatted.some(({ billingCadence }) => billingCadence === 'ANNUAL')).toBe(true);
    expect(formatted.some(({ billingCadence }) => billingCadence === 'MONTHLY')).toBe(true);
  });

  it('checks source numbers before BigInt conversion and rejects unsafe input', () => {
    const formatter = jest.fn(formatMinorUnits);
    const unsafe = [{
      id: 'unsafe', merchantName: 'Fictional', amountMinor: Number.MAX_SAFE_INTEGER + 1,
      currency: 'SEK' as const, billingCadence: 'MONTHLY' as const,
    }];
    expect(() => formatDemoSubscriptions(unsafe, 'en', formatter)).toThrow();
    expect(formatter).not.toHaveBeenCalled();
  });
});
