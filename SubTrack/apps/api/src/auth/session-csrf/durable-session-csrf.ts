import { createHash, randomBytes } from 'node:crypto';

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const DOMAIN = 'subtrack:v2:session-csrf:core:v1:token:';

/** Digest-only durable representation of one canonical 256-bit CSRF token. */
export function hashDurableSessionCsrf(token: string): string {
  if (typeof token !== 'string' || !TOKEN.test(token)) throw new Error('Session CSRF unavailable');
  const bytes = Buffer.from(token, 'base64url');
  if (bytes.length !== 32 || bytes.toString('base64url') !== token) throw new Error('Session CSRF unavailable');
  return createHash('sha256').update(DOMAIN, 'utf8').update(token, 'utf8').digest('hex');
}

export function mintDurableSessionCsrf(): Readonly<{ token: string; digest: string }> {
  const token = randomBytes(32).toString('base64url');
  return Object.freeze({ token, digest: hashDurableSessionCsrf(token) });
}
