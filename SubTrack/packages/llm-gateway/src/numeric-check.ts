export interface NumericCheckResult {
  passed: boolean;
  foundNumbers: number[];
  warnings: string[];
}

const SUSPICIOUS_WORD_PATTERNS: RegExp[] = [
  /\bNaN\b/g,
  /\bInfinity\b/g,
  /\b-Infinity\b/g,
  /\bundefined\b/g,
  /\bnull\b/g,
];

const LONG_INT_PATTERN = /\b\d{16,}\b/g;

export function checkNumericOutput(
  text: string,
  opts: { maxAbsValue?: number } = {},
): NumericCheckResult {
  const maxAbs = opts.maxAbsValue ?? 1e12;
  const foundNumbers: number[] = [];
  const warnings: string[] = [];

  const numRegex = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  for (const match of text.matchAll(numRegex)) {
    const n = parseFloat(match[0]);
    if (!isNaN(n)) {
      foundNumbers.push(n);
      if (Math.abs(n) > maxAbs) {
        warnings.push(`Suspiciously large number: ${n}`);
      }
    }
  }

  for (const pattern of SUSPICIOUS_WORD_PATTERNS) {
    for (const m of text.matchAll(pattern)) {
      warnings.push(`Suspicious pattern: "${m[0]}"`);
    }
  }

  for (const m of text.matchAll(LONG_INT_PATTERN)) {
    warnings.push(`Suspiciously long integer: "${m[0]}"`);
  }

  return { passed: warnings.length === 0, foundNumbers, warnings };
}
