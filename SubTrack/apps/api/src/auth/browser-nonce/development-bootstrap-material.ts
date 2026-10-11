import { createHash, randomBytes } from 'node:crypto';
import type { BrowserPurpose } from './browser-nonce.js';

declare const bootstrapMaterialBrand: unique symbol;
type Configuration = Readonly<{ enabled: true; origin: string; epoch: string; manifestHash: string }>;
type BootstrapSql = Readonly<{
  nonceHash: string; bindingHash: string; chainId: string; transport: 'web';
  origin: string; epoch: string; manifestHash: string; purpose: BrowserPurpose; authorityHash: null;
}>;
/** Internal capability only; the brand is not proof of persisted provenance or commit. */
type BootstrapMaterial = Readonly<{
  sql: BootstrapSql;
  discloseSecrets(): Readonly<{ nonce: string; cookieSecret: string }>;
  readonly [bootstrapMaterialBrand]: true;
}>;
const failure = () => new Error('Browser nonce unavailable');
const hex = /^[0-9a-f]{64}$/;
const purposes: ReadonlySet<string> = new Set(['enroll_identifier', 'otp_step_up', 'session']);

function configuration(value: unknown): Configuration {
  const keys = ['enabled', 'origin', 'epoch', 'manifestHash'];
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).length !== keys.length) throw failure();
  const copied: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) throw failure();
    copied[key] = descriptor.value;
  }
  const { enabled, origin, epoch, manifestHash } = copied;
  if (enabled !== true || typeof origin !== 'string' || !origin || origin !== origin.trim() || origin.includes('*') ||
    typeof epoch !== 'string' || !epoch || epoch !== epoch.trim() ||
    typeof manifestHash !== 'string' || !hex.test(manifestHash)) throw failure();
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password ||
    url.pathname !== '/' || url.search || url.hash) throw failure();
  return Object.freeze({ enabled, origin, epoch, manifestHash });
}

function secret(): string {
  const bytes = randomBytes(32);
  if (!Buffer.isBuffer(bytes) || bytes.length !== 32) throw failure();
  const value = bytes.toString('base64url');
  if (!/^[A-Za-z0-9_-]{43}$/.test(value) || Buffer.from(value, 'base64url').toString('base64url') !== value) throw failure();
  return value;
}
function digest(kind: 'nonce' | 'cookie', value: string): string {
  const result = createHash('sha256').update(`subtrack:browser-nonce:v2:${kind}:`, 'utf8').update(value, 'utf8').digest('hex');
  if (typeof result !== 'string' || !hex.test(result)) throw failure();
  return result;
}

/** Unregistered development helper. A consumer must disclose only after known durable commit. */
export function createDevelopmentBootstrapMaterialProducer(config: unknown): Readonly<{ produce(purpose: BrowserPurpose): BootstrapMaterial }> {
  try {
    if (arguments.length !== 1 || process.env.NODE_ENV !== 'development') throw failure();
    const captured = configuration(config);
    return Object.freeze({
      produce(purpose: BrowserPurpose): BootstrapMaterial {
        try {
          if (arguments.length !== 1 || process.env.NODE_ENV !== 'development' ||
            typeof purpose !== 'string' || !purposes.has(purpose)) throw failure();
          const nonce = secret(), cookieSecret = secret(), chainId = secret();
          if (new Set([nonce, cookieSecret, chainId]).size !== 3) throw failure();
          const sql: BootstrapSql = Object.freeze({
            nonceHash: digest('nonce', nonce), bindingHash: digest('cookie', cookieSecret), chainId,
            transport: 'web', origin: captured.origin, epoch: captured.epoch, manifestHash: captured.manifestHash,
            purpose, authorityHash: null,
          });
          const handle = { sql };
          Object.defineProperty(handle, 'discloseSecrets', {
            enumerable: false, configurable: false, writable: false,
            value: function discloseSecrets() {
              if (arguments.length !== 0) throw failure();
              return Object.freeze({ nonce, cookieSecret });
            },
          });
          return Object.freeze(handle) as BootstrapMaterial;
        } catch { throw failure(); }
      },
    });
  } catch { throw failure(); }
}
