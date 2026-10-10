import { defineConfig } from 'vitest/config';

// Only the dedicated newly owned PostgreSQL 16 proof invokes this file.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/subscription-lifecycle-storage.integration.ts'],
  },
});
