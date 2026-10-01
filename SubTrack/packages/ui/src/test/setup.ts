// Global test setup for packages/ui.
// jest-axe and @testing-library/jest-dom are brought in by apps/web's own vitest.
// This file sets up any globally needed configuration for unit + render tests.
import { expect } from 'vitest';

// Extend with any globally needed matchers here when new deps are available.
export { expect };
