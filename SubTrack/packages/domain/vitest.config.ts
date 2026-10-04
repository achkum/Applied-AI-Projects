import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['policy/**/*.test.ts', 'test/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['policy/**/*.ts'],
      exclude: ['policy/**/__tests__/**', 'policy/index.ts'],
      thresholds: {
        'policy/**/*.ts': { branches: 100 },
      },
    },
  },
});
