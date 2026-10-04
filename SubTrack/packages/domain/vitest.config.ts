import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['policy/**/*.test.ts', 'test/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['policy/**/*.ts', 'merchant/**/*.ts'],
      exclude: ['policy/**/__tests__/**', 'policy/index.ts', 'merchant/index.ts'],
      thresholds: {
        'policy/**/*.ts': { branches: 100 },
        'merchant/**/*.ts': { branches: 80, functions: 80, lines: 80, statements: 80 },
      },
    },
  },
});
