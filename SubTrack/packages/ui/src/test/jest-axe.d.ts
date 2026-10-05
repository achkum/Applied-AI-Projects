declare module 'jest-axe' {
  import type { AxeResults } from 'axe-core';

  export const axe: (html: Element | string) => Promise<AxeResults>;
  export const toHaveNoViolations: {
    toHaveNoViolations(results?: Partial<AxeResults>): {
      actual: NonNullable<AxeResults['violations']>;
      message(): string;
      pass: boolean;
    };
  };
}
