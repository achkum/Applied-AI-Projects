import { expect, it } from 'vitest';
import { formatMinorUnits } from './index';

it('exposes exact large minor-unit display for Swedish and English', () => {
  const amount = 123456789012345678n;
  expect(formatMinorUnits(amount, 'SEK', { locale: 'sv', display: 'code' }))
    .toBe('1\u00a0234\u00a0567\u00a0890\u00a0123\u00a0456,78\u00a0SEK');
  expect(formatMinorUnits(-amount, 'SEK', { locale: 'en', display: 'code' }))
    .toBe('-1\u00a0234\u00a0567\u00a0890\u00a0123\u00a0456,78\u00a0SEK');
});

it('honors zero-decimal currencies and rejects invalid formatter inputs', () => {
  expect(formatMinorUnits(9007199254740993n, 'JPY', { locale: 'en', display: 'code' }))
    .toBe('9\u00a0007\u00a0199\u00a0254\u00a0740\u00a0993\u00a0JPY');
  expect(() => formatMinorUnits(123n, 'not-a-currency')).toThrow(RangeError);
  expect(() => formatMinorUnits(123 as unknown as bigint, 'SEK')).toThrow(TypeError);
});
