import { defineConfig } from 'vitest/config';

// The owned PG16 shell proof bundles this entry into its locked Node22 sidecar.
export default defineConfig({ test: { environment: 'node', include: ['test/durable-development-enrollment.integration.ts'], testTimeout: 180_000 } });
