import { defineConfig } from 'vitest/config';

// Dedicated disposable PostgreSQL workflow only; excluded from the ordinary suite.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/subscription-read-storage.integration.ts'],
  },
});
