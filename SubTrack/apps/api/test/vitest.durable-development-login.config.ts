import { defineConfig } from 'vitest/config';

// The owned private PG16 shell bundles the integration entry after natural enrollment.
export default defineConfig({ test: { environment: 'node',
  include: ['test/durable-development-login.integration.ts'], testTimeout: 180_000 } });
