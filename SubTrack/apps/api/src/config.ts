import { z } from 'zod';

const loopbackHost = (hostname: string): boolean =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';

function canonicalOrigin(value: string, allowHttp: boolean): boolean {
  if (value !== value.trim() || value === 'null' || value.includes('*')) return false;
  try {
    const url = new URL(value);
    return url.origin === value && !url.username && !url.password &&
      url.pathname === '/' && !url.search && !url.hash &&
      (url.protocol === 'https:' || (allowHttp && url.protocol === 'http:' && loopbackHost(url.hostname)));
  } catch {
    return false;
  }
}

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  DATABASE_URL: z.string().url().min(1),
  AUTH_V2_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  AUTH_V2_ALLOWED_ORIGINS: z.string().optional(),
  AUTH_V2_BINDING_COOKIE_NAME: z.string().optional(),
  AUTH_V2_BINDING_COOKIE_PATH: z.string().optional(),
  AUTH_V2_ALLOW_LOOPBACK_HTTP: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
}).superRefine((value, ctx) => {
  if (value.AUTH_V2_ALLOW_LOOPBACK_HTTP && value.NODE_ENV !== 'development') {
    ctx.addIssue({ code: 'custom', path: ['AUTH_V2_ALLOW_LOOPBACK_HTTP'], message: 'invalid' });
  }
  if (!value.AUTH_V2_ENABLED) return;
  const originsField = 'AUTH_V2_ALLOWED_ORIGINS';
  let origins: unknown;
  try {
    origins = JSON.parse(value.AUTH_V2_ALLOWED_ORIGINS ?? '');
  } catch {
    ctx.addIssue({ code: 'custom', path: [originsField], message: 'invalid' });
    origins = null;
  }
  const allowHttp = value.AUTH_V2_ALLOW_LOOPBACK_HTTP;
  if (!Array.isArray(origins) || origins.length === 0 || origins.some((origin) => typeof origin !== 'string' || !canonicalOrigin(origin, allowHttp))) {
    ctx.addIssue({ code: 'custom', path: [originsField], message: 'invalid' });
  }
  const name = value.AUTH_V2_BINDING_COOKIE_NAME;
  if (typeof name !== 'string' || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) ||
      ['st_v2_access', 'st_v2_refresh'].includes(name) || (name.startsWith('__Host-') && value.AUTH_V2_BINDING_COOKIE_PATH !== '/')) {
    ctx.addIssue({ code: 'custom', path: ['AUTH_V2_BINDING_COOKIE_NAME'], message: 'invalid' });
  }
  const path = value.AUTH_V2_BINDING_COOKIE_PATH;
  if (typeof path !== 'string' || !path.startsWith('/') || /[^\x20-\x7e]|[;?#]/.test(path)) {
    ctx.addIssue({ code: 'custom', path: ['AUTH_V2_BINDING_COOKIE_PATH'], message: 'invalid' });
  }
});

type ParsedConfig = z.infer<typeof configSchema>;
export type ApiConfig = Omit<ParsedConfig, 'AUTH_V2_ALLOWED_ORIGINS' | 'AUTH_V2_BINDING_COOKIE_NAME' | 'AUTH_V2_BINDING_COOKIE_PATH'> & {
  readonly AUTH_V2_ALLOWED_ORIGINS: readonly string[];
  readonly AUTH_V2_BINDING_COOKIE_NAME: string | null;
  readonly AUTH_V2_BINDING_COOKIE_PATH: string | null;
};

export function validateConfig(input: Record<string, unknown>): ApiConfig {
  const result = configSchema.safeParse(input);
  if (!result.success) {
    // Report names only. Zod issue messages can echo invalid values.
    const fields = [...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? 'configuration')))];
    throw new Error(`Invalid API configuration: ${fields.join(', ')}`);
  }
  const data = result.data;
  const origins = data.AUTH_V2_ENABLED ? JSON.parse(data.AUTH_V2_ALLOWED_ORIGINS!) as string[] : [];
  return {
    ...data,
    AUTH_V2_ALLOWED_ORIGINS: Object.freeze(origins),
    AUTH_V2_BINDING_COOKIE_NAME: data.AUTH_V2_ENABLED ? data.AUTH_V2_BINDING_COOKIE_NAME! : null,
    AUTH_V2_BINDING_COOKIE_PATH: data.AUTH_V2_ENABLED ? data.AUTH_V2_BINDING_COOKIE_PATH! : null,
  };
}
