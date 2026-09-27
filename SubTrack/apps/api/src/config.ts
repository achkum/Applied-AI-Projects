import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  DATABASE_URL: z.string().url().min(1),
});

export type ApiConfig = z.infer<typeof configSchema>;

export function validateConfig(input: Record<string, unknown>): ApiConfig {
  const result = configSchema.safeParse(input);
  if (!result.success) {
    // Report names only. Zod issue messages can echo invalid values.
    const fields = [
      ...new Set(
        result.error.issues.map((issue) =>
          String(issue.path[0] ?? 'configuration'),
        ),
      ),
    ];
    throw new Error(`Invalid API configuration: ${fields.join(', ')}`);
  }
  return result.data;
}
