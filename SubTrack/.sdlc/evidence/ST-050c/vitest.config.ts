import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const evidenceDirectory = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(evidenceDirectory, '../../..');

export default defineConfig({
  root: repo,
  test: {
    environment: 'node',
    include: ['apps/api/test/st050c-registration-proxy.integration.ts'],
    testTimeout: 360_000,
    hookTimeout: 300_000,
    reporters: ['default'],
  },
});
