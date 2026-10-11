import { defineConfig } from 'vitest/config';
// Linux Chromium/owned PG16 proof; missing prerequisites fail.
export default defineConfig({ test: { environment: 'node', include: ['test/browser-subscription-lifecycle.integration.ts'], testTimeout: 180_000 } });
