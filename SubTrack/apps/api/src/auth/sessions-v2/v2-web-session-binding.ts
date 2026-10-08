import { createHash } from 'node:crypto';

const DOMAIN = 'subtrack:auth-session:v2:browser-binding:';
const COOKIE = /^[A-Za-z0-9_-]{43}$/;

/** Hashes one canonical 32-byte base64url browser binding cookie for internal storage. */
export function hashBrowserBindingCookie(cookie: string): string {
  if (typeof cookie !== 'string' || !COOKIE.test(cookie)) throw new Error('Invalid browser binding cookie');
  const decoded = Buffer.from(cookie, 'base64url');
  if (decoded.byteLength !== 32 || decoded.toString('base64url') !== cookie) throw new Error('Invalid browser binding cookie');
  return createHash('sha256').update(DOMAIN, 'utf8').update(decoded).digest('hex');
}

export function isBrowserBindingCookieHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
