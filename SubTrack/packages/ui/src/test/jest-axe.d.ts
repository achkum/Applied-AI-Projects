declare module 'jest-axe' {
  import type { AxeResults, RunOptions } from 'axe-core';
  export type JestAxe = (html: Element | string, options?: RunOptions) => Promise<AxeResults>;
  export const axe: JestAxe;
  export function configureAxe(options?: RunOptions): JestAxe;
  export const toHaveNoViolations: { toHaveNoViolations: () => { pass: boolean; message: () => string } };
}

import type { Assertion } from 'vitest';
declare module 'vitest' {
  interface Assertion<R = any> {
    toHaveNoViolations(): R;
  }
  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): void;
  }
}
