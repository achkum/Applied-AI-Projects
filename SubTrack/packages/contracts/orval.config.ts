import { defineConfig } from 'orval';

export default defineConfig({
  subtrack: {
    input: {
      target: './openapi.yaml',
    },
    output: {
      client: 'fetch',
      mode: 'single',
      target: './generated/client.ts',
    },
  },
  subtrackZod: {
    input: {
      target: './openapi.yaml',
    },
    output: {
      client: 'zod',
      mode: 'single',
      target: './generated/schemas.ts',
      override: {
        zod: {
          version: 4,
        },
      },
    },
  },
});
