// Global test setup for packages/ui.
// jest-axe and @testing-library/jest-dom are brought in by apps/web's own vitest.
// This file sets up any globally needed configuration for unit + render tests.
import '@testing-library/jest-dom/vitest';
import { expect } from 'vitest';
import { toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);
export { expect };
