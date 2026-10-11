import type { BrowserPurpose } from './browser-nonce.js';
import { createDevelopmentBootstrapMaterialProducer } from './development-bootstrap-material.js';
import { createDevelopmentBootstrapBurnMaterialProducer } from '../idempotency/development-bootstrap-burn-material.js';

type Burn = ReturnType<ReturnType<typeof createDevelopmentBootstrapBurnMaterialProducer>['produce']>['sql'];
type Nonce = ReturnType<ReturnType<typeof createDevelopmentBootstrapMaterialProducer>['produce']>['sql'];
type ReserveOutcome = 'knownCommitted' | 'unknown';
type OperationOutcome = 'knownCommitted' | 'knownRollback' | 'unknown';
export type TrustedBootstrapTransactionPort = {
  /** Independently commit the global burn; never replay an earlier result. */
  reserve(burn: Burn): Promise<ReserveOutcome>;
  /** One connection and transaction: INSERT nonce and settle this pending burn completed atomically. */
  operation(burn: Burn, nonce: Nonce): Promise<OperationOutcome>;
  /** Conditional failed settlement of this exact owned pending burn after proven rollback only. */
  fail(burn: Burn): Promise<OperationOutcome>;
};

const failure = () => new Error('AUTH_RESTART_REQUIRED');
const keyPattern = /^[\x21-\x7e]{16,255}$/;
const purposes: ReadonlySet<string> = new Set(['enroll_identifier', 'otp_step_up', 'session']);
const configKeys = ['enabled', 'origin', 'epoch', 'manifestHash', 'retentionMs', 'idempotencyKey', 'originKey'];
const portKeys = ['reserve', 'operation', 'fail'];
const intrinsicBind = Function.prototype.bind;

function dataFields(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).length !== keys.length) throw failure();
  const fields: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) throw failure();
    fields[key] = descriptor.value;
  }
  return fields;
}

/** Private, unregistered development lifecycle. Port outcomes are trusted adapter claims, not PG proof. */
export function createDevelopmentBootstrapTransaction(config: unknown, port: TrustedBootstrapTransactionPort): Readonly<{
  issue(idempotencyKey: string, purpose: BrowserPurpose): Promise<Readonly<{ nonce: string; cookieSecret: string }>>;
}> {
  try {
    if (arguments.length !== 2 || process.env.NODE_ENV !== 'development') throw failure();
    const fields = dataFields(config, configKeys);
    const nonceProducer = createDevelopmentBootstrapMaterialProducer({
      enabled: fields.enabled, origin: fields.origin, epoch: fields.epoch, manifestHash: fields.manifestHash,
    });
    const burnProducer = createDevelopmentBootstrapBurnMaterialProducer(fields);
    const methods = dataFields(port, portKeys);
    for (const key of portKeys) if (typeof methods[key] !== 'function') throw failure();
    const reserve = Reflect.apply(intrinsicBind, methods.reserve, [port]) as TrustedBootstrapTransactionPort['reserve'];
    const operation = Reflect.apply(intrinsicBind, methods.operation, [port]) as TrustedBootstrapTransactionPort['operation'];
    const fail = Reflect.apply(intrinsicBind, methods.fail, [port]) as TrustedBootstrapTransactionPort['fail'];

    return Object.freeze({
      async issue(idempotencyKey: string, purpose: BrowserPurpose) {
        try {
          if (arguments.length !== 2 || process.env.NODE_ENV !== 'development' ||
            typeof idempotencyKey !== 'string' || !keyPattern.test(idempotencyKey) ||
            typeof purpose !== 'string' || !purposes.has(purpose)) throw failure();
          // Both producer capabilities remain closure-private. Capture before any port call.
          const nonceHandle = nonceProducer.produce(purpose);
          const burnHandle = burnProducer.produce(idempotencyKey, purpose);
          const nonce = nonceHandle.sql, burn = burnHandle.sql;
          if (nonce.origin !== burn.origin || nonce.epoch !== burn.epoch ||
            nonce.manifestHash !== burn.manifestHash || nonce.purpose !== burn.purpose ||
            burn.operation !== 'createV2BrowserNonce' || burn.authorityKind !== 'browser-bootstrap-origin' ||
            burn.transport !== 'web' || nonce.transport !== 'web' || nonce.authorityHash !== null ||
            !Object.isFrozen(nonce) || !Object.isFrozen(burn)) throw failure();
          if (await reserve(burn) !== 'knownCommitted') throw failure();
          const outcome = await operation(burn, nonce);
          if (outcome === 'knownCommitted') return nonceHandle.discloseSecrets();
          if (outcome === 'knownRollback') await fail(burn);
          throw failure();
        } catch { throw failure(); }
      },
    });
  } catch { throw failure(); }
}
