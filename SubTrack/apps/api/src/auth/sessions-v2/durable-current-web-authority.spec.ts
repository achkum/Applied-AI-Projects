import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { V2AccessToken } from './v2-access-token.js';
import { DurableCurrentWebAuthority, type CurrentWebRequest, type OwnerTx } from './durable-current-web-authority.js';
import { createDurableCurrentWebFixture } from './durable-current-web-fixture.js';

const origin = 'https://st233a.invalid';
const manifestHash = 'a'.repeat(64);
const owner = randomUUID();
const session = randomUUID();
const keys = generateKeyPairSync('ed25519');
const tokens = new V2AccessToken({ environment: 'development', enabled: true,
  privateKey: keys.privateKey, publicKey: keys.publicKey, clock: Date.now });
const request: CurrentWebRequest = Object.freeze({ accessToken: tokens.issue(owner, session),
  exactOrigin: origin, bindingCookie: randomBytes(32).toString('base64url'),
  browserChainId: randomBytes(32).toString('base64url'), csrfToken: randomBytes(32).toString('base64url') });
const priorNodeEnv = process.env.NODE_ENV;
beforeEach(() => { process.env.NODE_ENV = 'development'; });
afterEach(() => {
  if (priorNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = priorNodeEnv;
});

type FakeOptions = Readonly<{ denied?: boolean; commitCommand?: string; releaseThrows?: boolean }>;
function setup(options: FakeOptions = {}) {
  const calls: string[] = [];
  let role = 'subtrack_dev_auth_login';
  let bound = false;
  let released = false;
  const client = {
    async query(sql: string) {
      calls.push(sql);
      if (released) throw new Error('released');
      if (sql.startsWith('SET LOCAL ROLE')) role = 'subtrack_runtime';
      if (sql.includes('set_config')) bound = true;
      if (sql === 'COMMIT' || sql === 'ROLLBACK') { role = 'subtrack_dev_auth_login'; bound = false; }
      if (sql.includes('session_user::text')) return { rows: [{ session_user: 'subtrack_dev_auth_login',
        current_user: role, user_id: bound ? owner : '', current_user_id: bound ? owner : '' }], command: 'SELECT' };
      if (sql.includes('public.identity')) return { rows: [{ id: owner }], command: 'SELECT' };
      if (sql.includes('subtrack_auth.')) return { rows: [{ ok: !options.denied }], command: 'SELECT' };
      return { rows: [], command: sql === 'COMMIT' ? options.commitCommand ?? 'COMMIT' : sql === 'ROLLBACK' ? 'ROLLBACK' : 'SELECT' };
    },
    release(error?: Error) { calls.push(error ? 'discard' : 'release'); released = true; if (options.releaseThrows) throw new Error('release failed'); },
  };
  const pool = { connect: async () => client } as unknown as Pick<Pool, 'connect'>;
  const authority = new DurableCurrentWebAuthority({ pool, accessTokens: tokens, origin,
    epoch: 'epoch-1', manifestHash });
  return { authority, calls };
}

describe('durable current web authority transaction', () => {
  it('holds one connection and invalidates the owner query capability after known commit', async () => {
    const { authority, calls } = setup();
    let leaked: OwnerTx | undefined;
    const result = await authority.withCurrentWebAuthority(request, async (tx, witness) => {
      leaked = tx;
      expect(witness).toEqual({ identityId: owner, sessionId: session });
      await tx.query('UPDATE public.identity SET updated_at=updated_at WHERE id=$1::uuid', [owner]);
      return 'committed';
    });
    expect(result).toBe('committed');
    expect(calls.filter((sql) => sql.includes('check_current_web'))).toHaveLength(2);
    expect(calls.indexOf('COMMIT')).toBeGreaterThan(calls.findIndex((sql) => sql.startsWith('UPDATE')));
    expect(calls.at(-1)).toBe('release');
    await expect(leaked!.query('SELECT 1')).rejects.toThrow('Current web session unavailable');
  });

  it('rejects bad envelope before checkout and denied checker before callback', async () => {
    const first = setup();
    await expect(first.authority.withCurrentWebAuthority({ ...request, exactOrigin: 'https://other.invalid' }, async () => 1))
      .rejects.toThrow('Current web session unavailable');
    expect(first.calls).toEqual([]);
    const second = setup({ denied: true });
    let called = false;
    await expect(second.authority.withCurrentWebAuthority(request, async () => { called = true; return 1; }))
      .rejects.toThrow('Current web session unavailable');
    expect(called).toBe(false);
    expect(second.calls).toContain('ROLLBACK');
    expect(second.calls.at(-1)).toBe('discard');
  });

  it('rolls back callback failure and refuses transaction control through OwnerTx', async () => {
    const first = setup();
    await expect(first.authority.withCurrentWebAuthority(request, async (tx) => {
      await tx.query('COMMIT'); return 1;
    })).rejects.toThrow('Current web session unavailable');
    expect(first.calls).not.toContain('COMMIT');
    expect(first.calls).toContain('ROLLBACK');
    const second = setup();
    await expect(second.authority.withCurrentWebAuthority(request, async () => { throw new Error('business failed'); }))
      .rejects.toThrow('Current web session unavailable');
    expect(second.calls).toContain('ROLLBACK');
  });

  it('does not disclose result when COMMIT resolves as ROLLBACK', async () => {
    const { authority, calls } = setup({ commitCommand: 'ROLLBACK' });
    await expect(authority.withCurrentWebAuthority(request, async () => 'secret-result'))
      .rejects.toThrow('Current web session unavailable');
    expect(calls).toContain('COMMIT');
    expect(calls.at(-1)).toBe('discard');
  });

  it('uses the same envelope and transaction path for replacement and revoke', async () => {
    const first = setup();
    const next = await first.authority.replaceCurrentCsrf(request);
    expect(next).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(next).not.toBe(request.csrfToken);
    expect(first.calls.some((sql) => sql.includes('replace_current_csrf'))).toBe(true);
    const second = setup();
    await second.authority.revokeCurrent(request);
    expect(second.calls.some((sql) => sql.includes('revoke_current'))).toBe(true);
  });

  it('rejects default and production construction before checkout, including fixture issuance', () => {
    let connects = 0;
    const pool = { connect: async () => { connects += 1; throw new Error('unreachable'); } } as unknown as Pick<Pool, 'connect'>;
    for (const environment of [undefined, 'production']) {
      if (environment === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = environment;
      expect(() => new DurableCurrentWebAuthority({ pool, accessTokens: tokens, origin, epoch: 'epoch-1', manifestHash }))
        .toThrow('Current web session unavailable');
      expect(() => createDurableCurrentWebFixture({ pool, accessTokens: tokens, origin,
        epoch: 'epoch-1', manifestHash, ownerId: owner, nonce: request.csrfToken,
        chain: request.browserChainId, bindingCookie: request.bindingCookie }))
        .toThrow('Fixture issuance unavailable');
    }
    expect(connects).toBe(0);
  });

  it('copies pinned configuration and stops use after the environment changes', async () => {
    const { authority, calls } = setup();
    process.env.NODE_ENV = 'production';
    await expect(authority.withCurrentWebAuthority(request, async () => 1))
      .rejects.toThrow('Current web session unavailable');
    expect(calls).toEqual([]);
  });
});
