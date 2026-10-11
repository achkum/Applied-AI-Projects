import { Client } from 'pg';
import type { QueryResult } from 'pg';
import type { TrustedBootstrapTransactionPort } from './development-bootstrap-transaction.js';

type Burn = Parameters<TrustedBootstrapTransactionPort['reserve']>[0];
type Nonce = Parameters<TrustedBootstrapTransactionPort['operation']>[1];
const fail = () => new Error('AUTH_RESTART_REQUIRED');
const hex = /^[0-9a-f]{64}$/;
const chain = /^[A-Za-z0-9_-]{43}$/;
const purposes = new Set(['enroll_identifier', 'otp_step_up', 'session']);
const burnKeys = ['keyHash', 'ownerHash', 'authorityHash', 'requestHash', 'operation', 'authorityKind', 'transport', 'origin', 'epoch', 'manifestHash', 'purpose', 'retentionMs'];
const nonceKeys = ['nonceHash', 'bindingHash', 'chainId', 'transport', 'origin', 'epoch', 'manifestHash', 'purpose', 'authorityHash'];
const configKeys = ['enabled', 'origin', 'epoch', 'manifestHash', 'database', 'password'];
const reserveSql = 'SELECT subtrack_auth.reserve_bootstrap($1,$2,$3,$4,$5,$6,$7,$8,$9) AS value';
const operationSql = 'SELECT subtrack_auth.issue_bootstrap_nonce($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) AS value';
const failSql = 'SELECT subtrack_auth.settle_bootstrap($1,$2,$3,$4,$5,$6,$7,$8,$9) AS value';

function fields(value: unknown, keys: readonly string[], frozen = true): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).length !== keys.length || frozen && !Object.isFrozen(value)) throw fail();
  const copy: Record<string, unknown> = {};
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !d.enumerable || !('value' in d)) throw fail();
    copy[key] = d.value;
  }
  return Object.freeze(copy);
}
function exact(result: QueryResult, command: string, count: number) {
  if (result.command !== command || result.rowCount !== (command === 'SELECT' ? count : null) ||
    result.rows.length !== count) throw fail();
}
function observed(): number {
  const now = Date.now();
  if (!Number.isSafeInteger(now) || now < 0 || now > 9_007_199_254_440_991) throw fail();
  return now;
}
function same(a: Record<string, unknown>, b: Record<string, unknown>) {
  return Object.keys(a).every(k => a[k] === b[k]);
}

/** Private fixture-only port; never register it in an HTTP or production composition root. */
export function createDevelopmentBootstrapPostgresPort(config: unknown): TrustedBootstrapTransactionPort {
  if (arguments.length !== 1 || process.env.NODE_ENV !== 'development') throw fail();
  // Config is the sole connection source: pg ambient variables and URL defaults have no authority.
  const c = fields(config, configKeys, false);
  if (c.enabled !== true || c.origin !== 'https://st233a.invalid' ||
    typeof c.epoch !== 'string' || !c.epoch || c.epoch !== c.epoch.trim() ||
    typeof c.manifestHash !== 'string' || !hex.test(c.manifestHash) ||
    c.database !== 'st233a_development_auth_foundation_proof' ||
    typeof c.password !== 'string' || !/^[a-f0-9]{48}$/.test(c.password)) throw fail();
  if (Object.keys(process.env).some(key => /^(?:PG[A-Z_]*|DATABASE_URL|DIRECT_URL|DOCKER_[A-Z_]*)$/.test(key))) throw fail();
  let state: 'empty' | 'busy' | 'reserved' | 'rollback' | 'done' = 'empty';
  let original: Burn | undefined;
  let witness: Record<string, unknown> | undefined;
  const checkBurn = (burn: Burn) => {
    const b = fields(burn, burnKeys);
    if (![b.keyHash, b.ownerHash, b.authorityHash, b.requestHash, b.manifestHash].every(v => typeof v === 'string' && hex.test(v)) ||
      b.operation !== 'createV2BrowserNonce' || b.authorityKind !== 'browser-bootstrap-origin' || b.transport !== 'web' ||
      b.origin !== c.origin || b.epoch !== c.epoch || b.manifestHash !== c.manifestHash ||
      !purposes.has(b.purpose as string) || !Number.isSafeInteger(b.retentionMs) ||
      (b.retentionMs as number) < 1 || (b.retentionMs as number) > 86_400_000) throw fail();
    return b;
  };
  const checkNonce = (nonce: Nonce, b: Record<string, unknown>) => {
    const n = fields(nonce, nonceKeys);
    if (![n.nonceHash, n.bindingHash].every(v => typeof v === 'string' && hex.test(v)) ||
      typeof n.chainId !== 'string' || !chain.test(n.chainId) ||
      n.transport !== 'web' || n.authorityHash !== null ||
      n.origin !== b.origin || n.epoch !== b.epoch || n.manifestHash !== b.manifestHash || n.purpose !== b.purpose) throw fail();
    return n;
  };
  async function transact(sql: string, args: readonly unknown[], mode: 'reserve' | 'operation' | 'fail') {
    const client = new Client({ host: '127.0.0.1', port: 5432, database: c.database as string,
      user: 'subtrack_dev_auth_login', password: c.password as string, ssl: false,
      connectionTimeoutMillis: 3000, query_timeout: 3000, statement_timeout: 2000,
      lock_timeout: 1000, idle_in_transaction_session_timeout: 4000, application_name: 'st233m-port' });
    client.on('error', () => {});
    let outcome: 'knownCommitted' | 'knownRollback' | 'unknown' = 'unknown';
    try {
      await client.connect();
      if (client.getTransactionStatus() !== 'I') throw fail();
      exact(await client.query('BEGIN ISOLATION LEVEL READ COMMITTED'), 'BEGIN', 0);
      exact(await client.query('SET LOCAL ROLE subtrack_runtime'), 'SET', 0);
      const role = await client.query("SELECT current_user = 'subtrack_runtime' AS role_ok, current_setting('transaction_isolation') = 'read committed' AS isolation_ok, coalesce(current_setting('app.user_id',true),'') = '' AS user_ok, coalesce(current_setting('app.current_user_id',true),'') = '' AS current_ok");
      exact(role, 'SELECT', 1);
      if (Object.keys(role.rows[0]).length !== 4 || Object.values(role.rows[0]).some(v => v !== true)) throw fail();
      const result = await client.query(sql, args.map(value => value === null ? observed() : value));
      exact(result, 'SELECT', 1);
      if (Object.keys(result.rows[0]).length !== 1) throw fail();
      const value: unknown = result.rows[0].value;
      const accepted = mode === 'reserve' ? typeof value === 'string' && /^(?:[1-9][0-9]*)$/.test(value) &&
        BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER) : value === true;
      if (accepted) {
        exact(await client.query('COMMIT'), 'COMMIT', 0);
        if (client.getTransactionStatus() !== 'I') throw fail();
        outcome = 'knownCommitted';
      } else if (mode !== 'reserve' && value === false || mode === 'reserve' && value === null) {
        exact(await client.query('ROLLBACK'), 'ROLLBACK', 0);
        if (client.getTransactionStatus() !== 'I') throw fail();
        outcome = 'knownRollback';
      } else throw fail();
    } catch { outcome = 'unknown'; }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const ended = await Promise.race([client.end().then(() => true, () => false),
        new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 3000); })]);
      if (timer) clearTimeout(timer);
      if (!ended) { client.connection?.stream?.destroy(); return 'unknown' as const; }
    } catch { if (timer) clearTimeout(timer); client.connection?.stream?.destroy(); return 'unknown' as const; }
    return outcome;
  }
  return Object.freeze({
    async reserve(burn: Burn) {
      if (arguments.length !== 1 || state !== 'empty' || process.env.NODE_ENV !== 'development') throw fail();
      state = 'busy';
      try {
        const b = checkBurn(burn); original = burn; witness = b;
        const result = await transact(reserveSql, [b.keyHash, b.ownerHash, b.authorityHash, b.requestHash,
          b.retentionMs, b.origin, b.epoch, b.manifestHash, null], 'reserve');
        state = result === 'knownCommitted' ? 'reserved' : 'done';
        return result === 'knownCommitted' ? result : 'unknown';
      } catch { state = 'done'; throw fail(); }
    },
    async operation(burn: Burn, nonce: Nonce) {
      if (arguments.length !== 2 || state !== 'reserved' || burn !== original || !witness || process.env.NODE_ENV !== 'development') throw fail();
      state = 'busy';
      try {
        const b = checkBurn(burn); if (!same(b, witness)) throw fail();
        const n = checkNonce(nonce, b);
        const result = await transact(operationSql, [b.keyHash, b.ownerHash, b.authorityHash, b.requestHash,
          n.nonceHash, n.bindingHash, n.chainId, n.purpose, b.origin, b.epoch, b.manifestHash, null], 'operation');
        state = result === 'knownRollback' ? 'rollback' : 'done';
        return result;
      } catch { state = 'done'; throw fail(); }
    },
    async fail(burn: Burn) {
      if (arguments.length !== 1 || state !== 'rollback' || burn !== original || !witness || process.env.NODE_ENV !== 'development') throw fail();
      state = 'busy'; // Consume the one-use eligibility before any await.
      try {
        const b = checkBurn(burn); if (!same(b, witness)) throw fail();
        const result = await transact(failSql, [b.keyHash, b.ownerHash, b.authorityHash, b.requestHash,
          b.origin, b.epoch, b.manifestHash, null, 'failed'], 'fail');
        state = 'done';
        return result;
      } catch { state = 'done'; throw fail(); }
    },
  });
}
