import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['src/formatter.ts', 'src/parse-positive-sek-input.ts'],
      thresholds: {
        'src/formatter.ts': { branches: 100 },
        'src/parse-positive-sek-input.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
      },
    },
  },
});
