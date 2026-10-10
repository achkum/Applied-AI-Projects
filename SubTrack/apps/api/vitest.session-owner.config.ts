import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/session-owner-rls.integration.ts'],
  },
});
