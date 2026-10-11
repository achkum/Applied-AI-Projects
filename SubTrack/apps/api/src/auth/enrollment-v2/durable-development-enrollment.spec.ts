import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { DevelopmentEnrollmentPersonVerifier } from '../identity-provider/development-enrollment-person-verifier.js';
import { hashBrowserBindingCookie } from '../sessions-v2/v2-web-session-binding.js';
import { hashDurableSessionCsrf } from '../session-csrf/durable-session-csrf.js';
import { DurableDevelopmentEnrollment, type DurableEnrollmentConfig, type EnrollmentWeb } from './durable-development-enrollment.js';

const NOW = 1_800_000_000_000;
const UNAVAILABLE = 'AUTH_RESTART_REQUIRED';
const LOGIN = 'ENROLLMENT_LOGIN_REQUIRED';
const token = (byte: number) => Buffer.alloc(32, byte).toString('base64url');
const web: EnrollmentWeb = Object.freeze({ origin: 'https://st233a.invalid', bindingCookie: token(1), nonce: token(2), chainId: '', epoch: 'epoch-1' });
const keyNames = ['binding', 'idempotency', 'authority', 'request', 'nonce', 'otp', 'proof', 'person', 'session'] as const;
type Reply = { command: string; rowCount: number; rows: Record<string, unknown>[] };
const reply = (command: string, rows: Record<string, unknown>[] = []): Reply => ({ command, rowCount: rows.length, rows });

function fixture() {
  const calls: { sql: string; values: unknown[] }[] = [];
  const released: unknown[] = [];
  let role = 'subtrack_dev_auth_login';
  let userId: string | null = null;
  let commitNumber = 0;
  let failCommit = -1;
  let transitionFalse = '';
  let activeSubject = false;
  let dirtyAfterCommit = false;
  let now = NOW;
  const verifier = new DevelopmentEnrollmentPersonVerifier({ environment: 'development', enabled: true,
    simulatorHmacKey: new Uint8Array(32).fill(51), clock: () => now });
  const client = {
    query: vi.fn(async (sql: string, values: unknown[] = []): Promise<Reply> => {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT session_user::text')) return reply('SELECT', [{ session_user: 'subtrack_dev_auth_login',
        current_user: dirtyAfterCommit && commitNumber >= 3 ? 'subtrack_runtime' : 'subtrack_dev_auth_login',
        user_id: userId, current_user_id: userId, database_name: 'st233a_development_auth_foundation_proof' }]);
      if (sql.startsWith('BEGIN')) { role = 'subtrack_dev_auth_login'; userId = null; return reply('BEGIN'); }
      if (sql.startsWith('SET LOCAL ROLE ')) { role = sql.slice('SET LOCAL ROLE '.length); return reply('SET'); }
      if (sql === 'SELECT current_user::text AS role') return reply('SELECT', [{ role }]);
      if (sql === 'ROLLBACK') { role = 'subtrack_dev_auth_login'; userId = null; return reply('ROLLBACK'); }
      if (sql === 'COMMIT') {
        commitNumber++;
        if (commitNumber === failCommit) throw new Error('private commit outcome');
        role = 'subtrack_dev_auth_login'; userId = null; return reply('COMMIT');
      }
      if (sql.includes("set_config('app.user_id'")) { userId = String(values[0]); return reply('SELECT', [{ set_config: userId }]); }
      if (sql.includes('subtrack_auth.peek(')) return reply('SELECT', [{ value: token(5) }]);
      if (sql.includes('subtrack_auth.reserve_enrollment(')) return reply('SELECT', [{ value: '1' }]);
      if (sql.includes('subtrack_auth.terminal_enrollment(')) return reply('SELECT', [{ subject_h: 'a'.repeat(64),
        channel: 'email', contact: 'person@example.invalid', verified_at: new Date(NOW).toISOString(), given_name: 'Alice', surname: 'Andersson' }]);
      if (sql.includes('pg_advisory_xact_lock')) return reply('SELECT', [{ locked: null }]);
      if (sql.includes('FROM public.identity WHERE external_id=')) return reply('SELECT', activeSubject ? [{ id: '00000000-0000-4000-8000-000000000001', external_id: 'a'.repeat(64) }] : []);
      if (sql.includes('FROM public.identity WHERE id=')) return reply('SELECT', activeSubject ? [{ deleted_at: null }] : [{ id: values[0] }]);
      if (sql.startsWith('INSERT INTO public.identity(')) {
        const insert = /^INSERT INTO public\.identity\(([^)]+)\) VALUES\((.*)\) RETURNING id$/.exec(sql);
        const columns = insert?.[1]?.split(',').map(column => column.trim());
        const expressions = insert?.[2]?.split(',').map(expression => expression.trim());
        if (!columns || !expressions || expressions[columns.indexOf('updated_at')] !== 'pg_catalog.clock_timestamp()')
          throw Object.assign(new Error('identity-updated-at-required'), { code: '23502' });
        return reply('INSERT', [{ id: values[0] }]);
      }
      if (sql.startsWith('UPDATE public.identity ')) return { command: 'UPDATE', rowCount: 1, rows: [] };
      if (sql.startsWith('INSERT INTO public.identity_profile(')) return { command: 'INSERT', rowCount: 1, rows: [] };
      if (sql.includes('subtrack_auth.')) return reply('SELECT', [{ value: !sql.includes(`subtrack_auth.${transitionFalse}(`) }]);
      throw new Error(`unexpected SQL: ${sql}`);
    }),
    release: vi.fn((error?: Error) => { released.push(error); }),
  };
  const pool = { connect: vi.fn(async () => client as unknown as PoolClient) } as unknown as Pick<Pool, 'connect'>;
  const keys = Object.fromEntries(keyNames.map((name, index) => [name, new Uint8Array(32).fill(index + 11)])) as DurableEnrollmentConfig['keys'];
  const config: DurableEnrollmentConfig = { environment: 'development', enabled: true, origin: web.origin,
    epoch: web.epoch, manifestHash: 'b'.repeat(64), pool, clock: () => now, verifier, keys,
    developmentOtpCode: () => '123456' };
  return { calls, released, client, pool, verifier, config,
    service: () => new DurableDevelopmentEnrollment(config),
    time: (value: number) => { now = value; },
    failNthCommit: (value: number) => { failCommit = value; },
    falseTransition: (value: string) => { transitionFalse = value; },
    activeSubject: () => { activeSubject = true; },
    dirtyAfterCommit: () => { dirtyAfterCommit = true; },
  };
}

async function denied(promise: Promise<unknown>, message = UNAVAILABLE) {
  const error = await promise.catch((value: unknown) => value);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toBe(message);
  expect(Object.keys(error as object)).toEqual([]);
  expect(Object.hasOwn(error as object, 'cause')).toBe(false);
}
beforeEach(() => { vi.stubEnv('NODE_ENV', 'development'); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('private durable enrollment service', () => {
  it('copies keys and rejects untrusted configuration before touching the pool', () => {
    const f = fixture();
    const service = f.service();
    for (const key of Object.values(f.config.keys)) key.fill(0);
    expect(service).toBeInstanceOf(DurableDevelopmentEnrollment);
    expect(() => new DurableDevelopmentEnrollment({ ...f.config, environment: 'production' })).toThrow(UNAVAILABLE);
    expect(() => new DurableDevelopmentEnrollment({ ...f.config, keys: { ...f.config.keys, proof: f.config.keys.otp } })).toThrow(UNAVAILABLE);
    expect(() => new DurableDevelopmentEnrollment({ ...f.config, developmentOtpCode: undefined } as unknown as DurableEnrollmentConfig)).toThrow(UNAVAILABLE);
    expect(f.pool.connect).not.toHaveBeenCalled();
  });

  it('issues normalized contact and digest-only OTP through producer transactions', async () => {
    const f = fixture();
    const result = await f.service().startOtp(web, { identifier: ' Person@Example.Invalid ', channel: 'email', purpose: 'enroll_identifier' }, 'start-key-12345678');
    expect(result.challengeId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.nextBrowserNonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.expiresAt).toBe(NOW + 300_000);
    const issued = f.calls.find(call => call.sql.includes('subtrack_auth.issue_enrollment_otp('));
    expect(issued?.values).toContain('Person@example.invalid');
    expect(issued?.values).not.toContain('123456');
    expect(issued?.values).not.toContain(result.challengeId);
    expect(issued?.values.at(-1)).toBe(hashBrowserBindingCookie(web.bindingCookie));
    expect(issued?.values.at(-1)).not.toBe(issued?.values[5]);
    expect(issued?.sql).toContain('$19::subtrack_auth.h');
    expect(f.calls.filter(call => call.sql === 'COMMIT')).toHaveLength(3);
    expect(f.released).toEqual([undefined, undefined, undefined]);
  });

  it('commits a wrong OTP attempt before returning the generic failure', async () => {
    const f = fixture(); f.falseTransition('verify_enrollment_otp');
    await denied(f.service().verifyOtp(web, { challengeId: token(3), code: '000000' }, 'verify-key-1234567'));
    expect(f.calls.filter(call => call.sql === 'COMMIT')).toHaveLength(3);
    expect(f.calls.filter(call => call.sql === 'ROLLBACK')).toHaveLength(0);
    expect(f.calls.some(call => call.sql.includes('subtrack_auth.fail_enrollment_burn('))).toBe(false);
  });

  it('does not disclose a proof after an uncertain transition commit or replay its burn', async () => {
    const f = fixture(); f.failNthCommit(3);
    await denied(f.service().verifyOtp(web, { challengeId: token(3), code: '123456' }, 'verify-key-1234567'));
    expect(f.calls.filter(call => call.sql === 'COMMIT')).toHaveLength(3);
    expect(f.calls.some(call => call.sql === 'ROLLBACK')).toBe(false);
    expect(f.calls.some(call => call.sql.includes('subtrack_auth.fail_enrollment_burn('))).toBe(false);
    expect(f.released.at(-1)).toBeInstanceOf(Error);
  });

  it('consumes a restricted proof using runtime role and blocks a foreign binding', async () => {
    const f = fixture(); const service = f.service();
    const admitted = await service.admit(web, { proof: token(4) }, 'admit-key-12345678');
    expect(admitted.pending).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(f.calls.some(call => call.sql === 'SET LOCAL ROLE subtrack_runtime')).toBe(true);
    const before = f.calls.length;
    await denied(service.admit({ ...web, bindingCookie: 'invalid' }, { proof: token(4) }, 'other-key-12345678'));
    expect(f.calls).toHaveLength(before);
  });

  it('awaits trusted person evidence and rechecks the clock after the wait', async () => {
    const f = fixture();
    let release!: (value: Awaited<ReturnType<DevelopmentEnrollmentPersonVerifier['verify']>>) => void;
    vi.spyOn(f.verifier, 'verify').mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const pending = f.service().verifyPerson(web, { pending: token(6) }, 'person-key-1234567');
    await vi.waitFor(() => expect(typeof release).toBe('function'));
    f.time(NOW + 300_001);
    release({ method: 'BANKID', personnummerHmac: 'a'.repeat(64), verifiedAt: new Date(NOW).toISOString(), givenName: 'Alice', surname: 'Andersson' });
    await denied(pending);
    expect(f.calls.some(call => call.sql.includes('subtrack_auth.verify_enrollment_person('))).toBe(false);
  });

  it('captures the trusted verifier method at construction', async () => {
    const f = fixture();
    const trusted = vi.spyOn(f.verifier, 'verify').mockResolvedValue({ method: 'BANKID', personnummerHmac: 'a'.repeat(64),
      verifiedAt: new Date(NOW).toISOString(), givenName: 'Alice', surname: 'Andersson' });
    const service = f.service();
    const replacement = vi.fn().mockRejectedValue(new Error('late untrusted verifier'));
    Object.defineProperty(f.verifier, 'verify', { configurable: true, value: replacement });
    const result = await service.verifyPerson(web, { pending: token(6) }, 'person-key-1234567');
    expect(result.verified).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(trusted).toHaveBeenCalledOnce();
    expect(replacement).not.toHaveBeenCalled();
  });

  it('commits one owner-scoped identity, profile, session and consume before disclosing credentials', async () => {
    const f = fixture();
    await expect(f.client.query("INSERT INTO public.identity(id,external_id,auth_method) VALUES($1::uuid,$2::text,'BANKID') RETURNING id",
      ['00000000-0000-4000-8000-000000000002', 'a'.repeat(64)]))
      .rejects.toMatchObject({ code: '23502' });
    const result = await f.service().complete(web, { verified: token(7) }, 'complete-key-12345', 'sv-SE');
    expect(result.profile).toEqual({ displayName: null, avatarColourToken: null, avatarEmoji: null,
      language: 'sv', theme: 'system', defaultCurrency: 'SEK', profileComplete: false });
    const sql = f.calls.map(call => call.sql);
    const provisioner = sql.indexOf('SET LOCAL ROLE subtrack_identity_provisioner');
    const ownerGuc = sql.findIndex(value => value.includes("set_config('app.user_id'"));
    const profile = sql.findIndex(value => value.startsWith('INSERT INTO public.identity_profile('));
    const consume = sql.findIndex(value => value.includes('subtrack_auth.consume_enrollment('));
    const commit = sql.lastIndexOf('COMMIT');
    expect(provisioner).toBeGreaterThan(0);
    expect(ownerGuc).toBeGreaterThan(provisioner);
    expect(profile).toBeGreaterThan(ownerGuc);
    expect(consume).toBeGreaterThan(profile);
    expect(commit).toBeGreaterThan(consume);
    expect(sql.filter(value => value.includes('pg_advisory_xact_lock'))).toHaveLength(2);
    const issued = f.calls.find(call => call.sql.includes('subtrack_auth.issue_enrollment_session('));
    expect(result.refreshToken).toMatch(/^v2r\.[A-Za-z0-9_-]{43}$/);
    expect(issued?.values.at(-2)).toBe(createHash('sha256').update('subtrack:auth-refresh:v2:', 'utf8')
      .update(result.refreshToken, 'utf8').digest('hex'));
    expect(issued?.values.at(-1)).toBe(hashDurableSessionCsrf(result.csrfToken));
    expect(f.released.at(-1)).toBeUndefined();
  });

  it('returns login required only for a known active subject after rollback', async () => {
    const f = fixture(); f.activeSubject();
    await denied(f.service().complete(web, { verified: token(7) }, 'complete-key-12345'), LOGIN);
    expect(f.calls.some(call => call.sql.startsWith('INSERT INTO public.identity('))).toBe(false);
    expect(f.calls.some(call => call.sql === 'ROLLBACK')).toBe(true);
    expect(f.calls.some(call => call.sql.includes('subtrack_auth.fail_enrollment_burn('))).toBe(true);
  });

  it('withholds final credentials on unknown COMMIT or failed pool reset', async () => {
    const unknown = fixture(); unknown.failNthCommit(3);
    await denied(unknown.service().complete(web, { verified: token(7) }, 'complete-key-12345'));
    expect(unknown.calls.some(call => call.sql === 'ROLLBACK')).toBe(false);
    expect(unknown.calls.some(call => call.sql.includes('subtrack_auth.fail_enrollment_burn('))).toBe(false);
    const reset = fixture(); reset.dirtyAfterCommit();
    await denied(reset.service().complete(web, { verified: token(7) }, 'complete-key-12345'));
    expect(reset.released.at(-1)).toBeInstanceOf(Error);
  });

  it('rejects malformed web input, purpose and regressing clock without exposing diagnostics', async () => {
    const f = fixture(); const service = f.service();
    await denied(service.startOtp(web, { identifier: 'person@example.invalid', channel: 'email', purpose: 'otp_step_up' } as never, 'start-key-12345678'));
    await denied(service.verifyOtp({ ...web, origin: 'https://other.invalid' }, { challengeId: token(3), code: '123456' }, 'verify-key-1234567'));
    expect(f.calls).toHaveLength(0);
    await service.admit(web, { proof: token(4) }, 'admit-key-12345678');
    f.time(NOW - 1);
    await denied(service.admit(web, { proof: token(4) }, 'second-key-1234567'));
  });
});
