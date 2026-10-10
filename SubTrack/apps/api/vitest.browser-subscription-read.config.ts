import { defineConfig } from 'vitest/config';

// Dedicated Linux/Docker/Chromium proof; absence of prerequisites is a failure.
export default defineConfig({ test: { environment: 'node', include: ['test/browser-subscription-read.integration.ts'], testTimeout: 180_000 } });
