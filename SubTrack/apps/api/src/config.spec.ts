import { describe, expect, it } from 'vitest';
import { validateConfig } from './config';

const base = { DATABASE_URL: 'postgresql://api:local@localhost:5432/subtrack' };
const enabled = {
  ...base,
  AUTH_V2_ENABLED: 'true',
  AUTH_V2_ALLOWED_ORIGINS: '["https://app.example"]',
  AUTH_V2_BINDING_COOKIE_NAME: 'st_v2_browser',
  AUTH_V2_BINDING_COOKIE_PATH: '/v2/auth',
};

describe('v2 API configuration', () => {
  it('preserves disabled defaults and does not require v2 deployment values', () => {
    const config = validateConfig(base);
    expect(config.AUTH_V2_ENABLED).toBe(false);
    expect(config.AUTH_V2_ALLOWED_ORIGINS).toEqual([]);
    expect(config.AUTH_V2_BINDING_COOKIE_NAME).toBeNull();
  });

  it('accepts explicit canonical HTTPS origins and a distinct cookie binding', () => {
    expect(validateConfig(enabled)).toMatchObject({
      AUTH_V2_ENABLED: true,
      AUTH_V2_ALLOWED_ORIGINS: ['https://app.example'],
      AUTH_V2_BINDING_COOKIE_NAME: 'st_v2_browser',
    });
  });

  it.each([
    ['malformed boolean', { ...base, AUTH_V2_ENABLED: 'yes' }],
    ['missing origins', { ...base, AUTH_V2_ENABLED: 'true' }],
    ['bad origin', { ...enabled, AUTH_V2_ALLOWED_ORIGINS: '["null"]' }],
    ['noncanonical origin', { ...enabled, AUTH_V2_ALLOWED_ORIGINS: '["https://app.example/path"]' }],
    ['wildcard origin', { ...enabled, AUTH_V2_ALLOWED_ORIGINS: '["https://*"]' }],
    ['cookie path delimiter', { ...enabled, AUTH_V2_BINDING_COOKIE_PATH: '/v2;evil=1' }],
    ['cookie path query', { ...enabled, AUTH_V2_BINDING_COOKIE_PATH: '/v2?evil=1' }],
    ['cookie path fragment', { ...enabled, AUTH_V2_BINDING_COOKIE_PATH: '/v2#evil' }],
    ['cookie collision', { ...enabled, AUTH_V2_BINDING_COOKIE_NAME: 'st_v2_access' }],
    ['host prefix path', { ...enabled, AUTH_V2_BINDING_COOKIE_NAME: '__Host-binding', AUTH_V2_BINDING_COOKIE_PATH: '/v2' }],
    ['production loopback', { ...enabled, NODE_ENV: 'production', AUTH_V2_ALLOW_LOOPBACK_HTTP: 'true', AUTH_V2_ALLOWED_ORIGINS: '["http://localhost"]' }],
    ['disabled production loopback', { ...base, NODE_ENV: 'production', AUTH_V2_ALLOW_LOOPBACK_HTTP: 'true' }],
    ['disabled test loopback', { ...base, NODE_ENV: 'test', AUTH_V2_ALLOW_LOOPBACK_HTTP: 'true' }],
    ['control byte cookie path', { ...enabled, AUTH_V2_BINDING_COOKIE_PATH: '/v2/auth\t' }],
  ])('rejects %s without echoing supplied values', (_case, input) => {
    expect(() => validateConfig(input)).toThrow(/AUTH_V2_/);
    try { validateConfig(input); } catch (error) {
      expect((error as Error).message).not.toContain('app.example');
      expect((error as Error).message).not.toContain('localhost');
      expect((error as Error).message).not.toContain('st_v2_access');
    }
  });

  it('accepts explicit loopback HTTP only in development', () => {
    expect(validateConfig({ ...enabled, AUTH_V2_ALLOW_LOOPBACK_HTTP: 'true', AUTH_V2_ALLOWED_ORIGINS: '["http://localhost"]' }).AUTH_V2_ALLOWED_ORIGINS).toEqual(['http://localhost']);
  });

  it('enables the browser nonce endpoint only with distinct valid development keys', () => {
    const configured = validateConfig({ ...enabled, AUTH_V2_BROWSER_NONCE_ENABLED: 'true', AUTH_V2_IDEMPOTENCY_KEY: 'ab'.repeat(32), AUTH_V2_BROWSER_ORIGIN_HMAC_KEY: 'cd'.repeat(32) });
    expect(configured.AUTH_V2_BROWSER_NONCE_ENABLED).toBe(true);
    for (const input of [
      { ...enabled, AUTH_V2_BROWSER_NONCE_ENABLED: 'true' },
      { ...enabled, NODE_ENV: 'test', AUTH_V2_BROWSER_NONCE_ENABLED: 'true', AUTH_V2_IDEMPOTENCY_KEY: 'ab'.repeat(32), AUTH_V2_BROWSER_ORIGIN_HMAC_KEY: 'cd'.repeat(32) },
      { ...enabled, NODE_ENV: 'production', AUTH_V2_BROWSER_NONCE_ENABLED: 'true', AUTH_V2_IDEMPOTENCY_KEY: 'ab'.repeat(32), AUTH_V2_BROWSER_ORIGIN_HMAC_KEY: 'cd'.repeat(32) },
      { ...enabled, AUTH_V2_BROWSER_NONCE_ENABLED: 'true', AUTH_V2_IDEMPOTENCY_KEY: 'ab'.repeat(32), AUTH_V2_BROWSER_ORIGIN_HMAC_KEY: 'AB'.repeat(32) },
      { ...enabled, AUTH_V2_BROWSER_NONCE_ENABLED: 'true', AUTH_V2_IDEMPOTENCY_KEY: 'zz'.repeat(32), AUTH_V2_BROWSER_ORIGIN_HMAC_KEY: 'cd'.repeat(32) },
    ]) expect(() => validateConfig(input)).toThrow(/AUTH_V2/);
  });
});
