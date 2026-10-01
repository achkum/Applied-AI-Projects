import { MoneyError } from './money.js';

/**
 * Validate that a currency code looks like an ISO 4217 code.
 * Full ISO 4217 registry validation is out of scope; this guards against
 * obvious typos (wrong length, non-alpha chars).
 */
export function assertValidCurrencyCode(code: string): void {
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new MoneyError(
      `Invalid currency code "${code}": must be exactly 3 uppercase ASCII letters`,
    );
  }
}

/**
 * Validate that a minor-unit value is a safe integer.
 * Money arithmetic uses BigInt internally, but callers passing `number`
 * (e.g. from JSON) should be guarded against precision loss.
 */
export function assertSafeMinorUnits(value: number): void {
  if (!Number.isInteger(value)) {
    throw new MoneyError(
      `minorUnits must be an integer, got ${value}`,
    );
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(
      `minorUnits ${value} exceeds Number.MAX_SAFE_INTEGER; use BigInt`,
    );
  }
}
