import { describe, it, expect } from 'vitest';
import { checkNumericOutput } from '../src/numeric-check.js';

describe('checkNumericOutput', () => {
  it('empty string returns passed=true and no numbers', () => {
    const r = checkNumericOutput('');
    expect(r.passed).toBe(true);
    expect(r.foundNumbers).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('finds integer and float in normal sentence', () => {
    const r = checkNumericOutput('The value is 42.5 and count is 3');
    expect(r.foundNumbers).toContain(42.5);
    expect(r.foundNumbers).toContain(3);
    expect(r.passed).toBe(true);
  });

  it('warns on literal "NaN"', () => {
    const r = checkNumericOutput('Result was NaN');
    expect(r.passed).toBe(false);
    expect(r.warnings.some((w) => w.includes('NaN'))).toBe(true);
  });

  it('warns on literal "Infinity"', () => {
    const r = checkNumericOutput('The value is Infinity');
    expect(r.passed).toBe(false);
    expect(r.warnings.some((w) => w.includes('Infinity'))).toBe(true);
  });

  it('warns on number exceeding default maxAbsValue (1e12)', () => {
    const r = checkNumericOutput('Total: 1e15');
    expect(r.passed).toBe(false);
    expect(r.warnings.some((w) => w.includes('Suspiciously large'))).toBe(true);
  });

  it('normal numbers 1-999 produce no warnings', () => {
    const r = checkNumericOutput('Count: 42, price: 9.99, items: 100');
    expect(r.passed).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it('includes negative numbers in foundNumbers', () => {
    const r = checkNumericOutput('Balance: -150.75');
    expect(r.foundNumbers).toContain(-150.75);
  });

  it('parses scientific notation', () => {
    const r = checkNumericOutput('Value: 1.5e3');
    expect(r.foundNumbers).toContain(1500);
  });

  it('text with no numbers returns empty foundNumbers', () => {
    const r = checkNumericOutput('Hello world, no digits here!');
    expect(r.foundNumbers).toEqual([]);
    expect(r.passed).toBe(true);
  });

  it('multiple suspicious patterns all appear in warnings', () => {
    const r = checkNumericOutput('got NaN and Infinity and null and undefined');
    expect(r.warnings.length).toBeGreaterThanOrEqual(4);
    expect(r.passed).toBe(false);
  });

  it('respects custom maxAbsValue', () => {
    const r = checkNumericOutput('Value: 500', { maxAbsValue: 100 });
    expect(r.passed).toBe(false);
    expect(r.warnings.some((w) => w.includes('500'))).toBe(true);
  });

  it('a 16-digit integer triggers a long-integer warning', () => {
    const r = checkNumericOutput('id: 1234567890123456');
    expect(r.passed).toBe(false);
    expect(r.warnings.some((w) => w.includes('long'))).toBe(true);
  });
});
