import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['policy/**/*.test.ts', 'test/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: [
        'policy/**/*.ts',
        'merchant/**/*.ts',
        'detection/**/*.ts',
        'clustering/**/*.ts',
      ],
      exclude: [
        'policy/**/__tests__/**',
        'policy/index.ts',
        'merchant/index.ts',
        'detection/index.ts',
      ],
      thresholds: {
        'policy/**/*.ts': { branches: 100 },
        'merchant/**/*.ts': {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
        'detection/**/*.ts': {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
        'clustering/features.ts': {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
      },
    },
  },
});
