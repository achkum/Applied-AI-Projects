import { defineConfig } from 'vitest/config';

// Dedicated disposable PostgreSQL workflow; excluded from the ordinary suite.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/subscription-lifecycle-http.integration.ts'],
  },
});
