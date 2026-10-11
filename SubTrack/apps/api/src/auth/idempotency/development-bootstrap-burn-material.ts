import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { BrowserPurpose } from '../browser-nonce/browser-nonce.js';

declare const burnMaterialBrand: unique symbol;
type Configuration = Readonly<{
  origin: string; epoch: string; manifestHash: string; retentionMs: number;
  idempotencyKey: Buffer; originKey: Buffer;
}>;
type BootstrapBurnSql = Readonly<{
  keyHash: string; ownerHash: string; authorityHash: string; requestHash: string;
  operation: 'createV2BrowserNonce'; authorityKind: 'browser-bootstrap-origin'; transport: 'web';
  origin: string; epoch: string; manifestHash: string; purpose: BrowserPurpose; retentionMs: number;
}>;
/** Private trusted input only: the brand does not prove persisted ownership or admission. */
type BootstrapBurnMaterial = Readonly<{ sql: BootstrapBurnSql; readonly [burnMaterialBrand]: true }>;
const failure = () => new Error('AUTH_RESTART_REQUIRED');
const hex = /^[0-9a-f]{64}$/;
const strictKey = /^[\x21-\x7e]{16,255}$/;
const purposes: ReadonlySet<string> = new Set(['enroll_identifier', 'otp_step_up', 'session']);
const intrinsicByteLength = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength')?.get;

function copyKey(value: unknown): Buffer {
  if (!(value instanceof Uint8Array) || Object.getPrototypeOf(value) !== Uint8Array.prototype) throw failure();
  const length: unknown = intrinsicByteLength?.call(value);
  if (typeof length !== 'number' || length < 32 || Reflect.ownKeys(value).length !== length) throw failure();
  const copied = new Uint8Array(length);
  Uint8Array.prototype.set.call(copied, value);
  return Buffer.from(copied);
}

function configuration(value: unknown): Configuration {
  const keys = ['enabled', 'origin', 'epoch', 'manifestHash', 'idempotencyKey', 'originKey', 'retentionMs'];
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).length !== keys.length) throw failure();
  const copied: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) throw failure();
    copied[key] = descriptor.value;
  }
  const { enabled, origin, epoch, manifestHash, idempotencyKey, originKey, retentionMs } = copied;
  if (enabled !== true || typeof origin !== 'string' || !origin || origin !== origin.trim() || origin.includes('*') ||
    typeof epoch !== 'string' || !epoch || epoch !== epoch.trim() ||
    typeof manifestHash !== 'string' || !hex.test(manifestHash) ||
    !Number.isSafeInteger(retentionMs) || (retentionMs as number) < 1 || (retentionMs as number) > 86_400_000 ||
    idempotencyKey === originKey) throw failure();
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password ||
    url.pathname !== '/' || url.search || url.hash) throw failure();
  return Object.freeze({ origin, epoch, manifestHash, retentionMs: retentionMs as number,
    idempotencyKey: copyKey(idempotencyKey), originKey: copyKey(originKey) });
}

function digest(value: string): string {
  const result = createHash('sha256').update(value, 'utf8').digest('hex');
  if (typeof result !== 'string' || !hex.test(result)) throw failure();
  return result;
}
function keyedDigest(key: Buffer, value: string): string {
  const result = createHmac('sha256', key).update(value, 'utf8').digest('hex');
  if (typeof result !== 'string' || !hex.test(result)) throw failure();
  return result;
}
function owner(): string {
  const bytes = randomBytes(32);
  if (!Buffer.isBuffer(bytes) || bytes.length !== 32) throw failure();
  const value = bytes.toString('base64url');
  if (!/^[A-Za-z0-9_-]{43}$/.test(value) || Buffer.from(value, 'base64url').toString('base64url') !== value) throw failure();
  return value;
}

/** Unregistered development-only producer; SQL later supplies time and admission. */
export function createDevelopmentBootstrapBurnMaterialProducer(config: unknown): Readonly<{
  produce(idempotencyKey: string, purpose: BrowserPurpose): BootstrapBurnMaterial;
}> {
  try {
    if (arguments.length !== 1 || process.env.NODE_ENV !== 'development') throw failure();
    const captured = configuration(config);
    return Object.freeze({
      produce(idempotencyKey: string, purpose: BrowserPurpose): BootstrapBurnMaterial {
        try {
          if (arguments.length !== 2 || process.env.NODE_ENV !== 'development' ||
            typeof idempotencyKey !== 'string' || !strictKey.test(idempotencyKey) ||
            typeof purpose !== 'string' || !purposes.has(purpose)) throw failure();
          const ownerHandle = owner();
          const sql: BootstrapBurnSql = Object.freeze({
            keyHash: keyedDigest(captured.idempotencyKey, `subtrack:v2:idempotency:core:v1:key:${idempotencyKey}`),
            ownerHash: digest(`subtrack:v2:idempotency:core:v1:owner:${ownerHandle}`),
            authorityHash: keyedDigest(captured.originKey, `subtrack:v2:browser-bootstrap-origin:v1:${captured.origin}`),
            requestHash: digest(`subtrack:v2:browser-nonce:request:v1:${Buffer.byteLength(purpose, 'utf8')}:${purpose}`),
            operation: 'createV2BrowserNonce', authorityKind: 'browser-bootstrap-origin', transport: 'web',
            origin: captured.origin, epoch: captured.epoch, manifestHash: captured.manifestHash,
            purpose, retentionMs: captured.retentionMs,
          });
          return Object.freeze({ sql }) as BootstrapBurnMaterial;
        } catch { throw failure(); }
      },
    });
  } catch { throw failure(); }
}
