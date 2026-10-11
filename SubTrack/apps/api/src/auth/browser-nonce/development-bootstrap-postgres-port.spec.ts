import assert from 'node:assert/strict';
import { beforeEach, afterEach, describe, it, vi } from 'vitest';
import { createDevelopmentBootstrapPostgresPort } from './development-bootstrap-postgres-port.js';
import type { TrustedBootstrapTransactionPort } from './development-bootstrap-transaction.js';

const driver = vi.hoisted(() => ({ calls: [] as string[], clients: [] as object[], values: [] as unknown[],
  commitTag: 'COMMIT', closeFault: false, gate: undefined as Promise<void> | undefined }));
vi.mock('pg', () => ({ Client: class {
  connection = { stream: { destroy() { driver.calls.push('destroy'); } } };
  constructor(readonly config: object) { driver.clients.push(config); }
  on() { return this; }
  async connect() { driver.calls.push('connect'); if (driver.gate) await driver.gate; }
  getTransactionStatus() { return 'I'; }
  async query(sql: string, params?: unknown[]) {
    driver.calls.push(sql);
    if (sql.startsWith('SELECT current_user')) return { command: 'SELECT', rowCount: 1,
      rows: [{ role_ok: true, isolation_ok: true, user_ok: true, current_ok: true }] };
    if (sql.startsWith('SELECT subtrack_auth.')) {
      const values = params ?? [];
      assert.equal(values.length, sql.includes('reserve_bootstrap') ? 9 : sql.includes('issue_bootstrap_nonce') ? 12 : 9);
      assert(Number.isSafeInteger(values[sql.includes('settle_bootstrap') ? 7 : values.length - 1]));
      return { command: 'SELECT', rowCount: 1, rows: [{ value: driver.values.shift() }] };
    }
    const command = sql === 'COMMIT' ? driver.commitTag : sql.startsWith('BEGIN') ? 'BEGIN' : sql.startsWith('SET') ? 'SET' : 'ROLLBACK';
    return { command, rowCount: null, rows: [] };
  }
  async end() { driver.calls.push('end'); if (driver.closeFault) throw Error('close acknowledgement lost'); }
} }));

type Burn = Parameters<TrustedBootstrapTransactionPort['reserve']>[0];
type Nonce = Parameters<TrustedBootstrapTransactionPort['operation']>[1];
const config = () => ({ enabled: true, origin: 'https://st233a.invalid', epoch: 'fixture',
  manifestHash: 'a'.repeat(64), database: 'st233a_development_auth_foundation_proof', password: 'b'.repeat(48) });
const burn = (): Burn => Object.freeze({ keyHash: '1'.repeat(64), ownerHash: '2'.repeat(64),
  authorityHash: '3'.repeat(64), requestHash: '4'.repeat(64), operation: 'createV2BrowserNonce',
  authorityKind: 'browser-bootstrap-origin', transport: 'web', origin: 'https://st233a.invalid',
  epoch: 'fixture', manifestHash: 'a'.repeat(64), purpose: 'session', retentionMs: 60_000 });
const nonce = (): Nonce => Object.freeze({ nonceHash: '5'.repeat(64), bindingHash: '6'.repeat(64),
  chainId: 'z'.repeat(43), transport: 'web', origin: 'https://st233a.invalid', epoch: 'fixture',
  manifestHash: 'a'.repeat(64), purpose: 'session', authorityHash: null });
beforeEach(() => { vi.stubEnv('NODE_ENV', 'development'); driver.calls.length = 0; driver.clients.length = 0;
  driver.values.length = 0; driver.commitTag = 'COMMIT'; driver.closeFault = false; driver.gate = undefined; });
afterEach(() => vi.unstubAllEnvs());

describe('fixed development PostgreSQL bootstrap port', () => {
  it('requires exact descriptor-safe private config and frozen complete witness', async () => {
    const bad = { ...config(), query: () => true };
    assert.throws(() => createDevelopmentBootstrapPostgresPort(bad));
    const accessor = Object.defineProperty(config(), 'password', { get: () => 'b'.repeat(48), enumerable: true });
    assert.throws(() => createDevelopmentBootstrapPostgresPort(accessor));
    const port = createDevelopmentBootstrapPostgresPort(config());
    await assert.rejects(port.reserve({ ...burn() }));
    assert.equal(driver.clients.length, 0);
  });

  it('independently commits reserve then atomic issue on separate restricted fresh clients', async () => {
    const port = createDevelopmentBootstrapPostgresPort(config()), b = burn();
    driver.values.push('9007199254740991', true);
    assert.equal(await port.reserve(b), 'knownCommitted');
    assert.equal(await port.operation(b, nonce()), 'knownCommitted');
    assert.equal(driver.clients.length, 2);
    assert(driver.clients.every(c => Object.getOwnPropertyDescriptor(c, 'user')?.value === 'subtrack_dev_auth_login'));
    assert.deepEqual(driver.calls.filter(c => c === 'COMMIT'), ['COMMIT', 'COMMIT']);
    assert.equal(driver.calls.filter(c => c === 'end').length, 2);
    await assert.rejects(port.fail(b));
  });

  it('permits one conditional failed settlement only after this operation explicitly rolled back', async () => {
    const port = createDevelopmentBootstrapPostgresPort(config()), b = burn();
    await assert.rejects(port.fail(b));
    driver.values.push('12345', false, true);
    assert.equal(await port.reserve(b), 'knownCommitted');
    assert.equal(await port.operation(b, nonce()), 'knownRollback');
    await assert.rejects(port.fail(Object.freeze({ ...b })));
    assert.equal(await port.fail(b), 'knownCommitted');
    await assert.rejects(port.fail(b));
    assert.equal(driver.calls.filter(c => c.includes('settle_bootstrap')).length, 1);
  });

  it('poisons unknown commit, aborted commit, and uncertain close without compensation', async () => {
    for (const fault of ['tag', 'close']) {
      driver.calls.length = 0; driver.values.push('12345');
      driver.commitTag = fault === 'tag' ? 'ROLLBACK' : 'COMMIT'; driver.closeFault = fault === 'close';
      const port = createDevelopmentBootstrapPostgresPort(config()), b = burn();
      assert.equal(await port.reserve(b), 'unknown');
      await assert.rejects(port.operation(b, nonce()));
      await assert.rejects(port.fail(b));
      assert.equal(driver.calls.filter(c => c.includes('issue_bootstrap_nonce') || c.includes('settle_bootstrap')).length, 0);
    }
  });

  it('does not turn an uncertain atomic issue into failed settlement', async () => {
    const port = createDevelopmentBootstrapPostgresPort(config()), b = burn();
    driver.values.push('12345', true);
    assert.equal(await port.reserve(b), 'knownCommitted');
    driver.commitTag = 'ROLLBACK';
    assert.equal(await port.operation(b, nonce()), 'unknown');
    await assert.rejects(port.fail(b));
    assert.equal(driver.calls.filter(c => c.includes('settle_bootstrap')).length, 0);
  });

  it('rejects a complete-witness mismatch without issuing SQL008', async () => {
    const port = createDevelopmentBootstrapPostgresPort(config()), b = burn();
    driver.values.push('12345');
    assert.equal(await port.reserve(b), 'knownCommitted');
    await assert.rejects(port.operation(Object.freeze({ ...b, ownerHash: 'f'.repeat(64) }), nonce()));
    assert.equal(driver.calls.filter(c => c.includes('issue_bootstrap_nonce')).length, 0);
  });

  it('rejects concurrent admission before creating another client', async () => {
    let release!: () => void;
    driver.gate = new Promise<void>(resolve => { release = resolve; });
    driver.values.push('12345');
    const port = createDevelopmentBootstrapPostgresPort(config()), b = burn();
    const pending = port.reserve(b);
    await assert.rejects(port.reserve(b));
    assert.equal(driver.clients.length, 1);
    release(); assert.equal(await pending, 'knownCommitted');
  });
});
