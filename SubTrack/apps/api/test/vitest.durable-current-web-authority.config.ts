import { defineConfig } from 'vitest/config';

// The owned PG16 shell proof bundles the integration entry into a locked Node sidecar.
export default defineConfig({ test: { environment: 'node', include: ['test/durable-current-web-authority.integration.ts'], testTimeout: 180_000 } });
