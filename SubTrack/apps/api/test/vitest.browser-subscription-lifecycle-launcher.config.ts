import { defineConfig } from 'vitest/config';
// Actual Linux/Docker proof; missing prerequisites fail.
export default defineConfig({ test: { environment: 'node', include: ['test/browser-subscription-lifecycle-launcher.integration.ts'], testTimeout: 180_000 } });
