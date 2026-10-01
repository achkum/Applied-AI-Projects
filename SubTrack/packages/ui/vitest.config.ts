import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Use esbuild for JSX instead of @vitejs/plugin-react to avoid the
  // vite/internal import issue with @vitejs/plugin-react@6 + Vite 6.
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
