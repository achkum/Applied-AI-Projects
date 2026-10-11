import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { V2AccessToken } from './v2-access-token.js';
import { hashBrowserBindingCookie } from './v2-web-session-binding.js';
import { mintDurableSessionCsrf } from '../session-csrf/durable-session-csrf.js';

const FAILURE = 'Fixture issuance unavailable';
const SECRET = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DIGEST = /^[a-f0-9]{64}$/;

function fail(): never { throw new Error(FAILURE); }
function canonicalSecret(value: string): boolean {
  if (typeof value !== 'string' || !SECRET.test(value)) return false;
  const bytes = Buffer.from(value, 'base64url');
  return bytes.length === 32 && bytes.toString('base64url') === value;
}

export function hashDurableFixtureNonce(nonce: string): string {
  if (!canonicalSecret(nonce)) fail();
  return createHash('sha256').update('subtrack:browser-nonce:v2:nonce:', 'utf8').update(nonce, 'utf8').digest('hex');
}

export type DurableCurrentWebFixtureConfig = Readonly<{
  pool: Pick<Pool, 'connect'>;
  accessTokens: V2AccessToken;
  origin: string;
  epoch: string;
  manifestHash: string;
  ownerId: string;
  nonce: string;
  chain: string;
  bindingCookie: string;
  observedMs?: (() => number) | undefined;
}>;

/** Disposable PG16 proof-only issuer; owner and nonce are captured, never issue parameters. */
export function createDurableCurrentWebFixture(config: DurableCurrentWebFixtureConfig): Readonly<{
  issueFixture(): Promise<Readonly<{ accessToken: string; refreshToken: string; bindingCookie: string; csrfToken: string }>>;
}> {
  if (process.env.NODE_ENV !== 'development' || config.origin !== 'https://st233a.invalid' || !UUID.test(config.ownerId) ||
    !DIGEST.test(config.manifestHash) || !config.epoch || !/^[A-Za-z0-9_-]{1,256}$/.test(config.chain) ||
    !config.pool || typeof config.pool.connect !== 'function' || !config.accessTokens ||
    typeof config.accessTokens.issue !== 'function' ||
    (config.observedMs !== undefined && typeof config.observedMs !== 'function')) fail();
  const nonceHash = hashDurableFixtureNonce(config.nonce);
  const bindingHash = hashBrowserBindingCookie(config.bindingCookie);
  const captured = Object.freeze({ ownerId: config.ownerId, nonceHash, bindingHash, chain: config.chain,
    bindingCookie: config.bindingCookie, origin: config.origin, epoch: config.epoch, manifestHash: config.manifestHash });
  const clock = config.observedMs ?? Date.now;
  const connect = config.pool.connect.bind(config.pool);
  const issueToken = config.accessTokens.issue.bind(config.accessTokens);
  let consumed = false;
  return Object.freeze({
    async issueFixture() {
      if (process.env.NODE_ENV !== 'development' || arguments.length !== 0 || consumed) fail();
      consumed = true;
      const client = await connect();
      let began = false;
      let commitAttempted = false;
      let released = false;
      try {
        const initial = await client.query(`SELECT session_user::text AS session_user,current_user::text AS current_user,
          pg_catalog.current_setting('app.user_id',true) AS user_id,
          pg_catalog.current_setting('app.current_user_id',true) AS current_user_id`);
        const state = initial.rows[0];
        if (initial.rows.length !== 1 || state?.session_user !== 'st233a_fixture_owner' ||
          state.current_user !== 'st233a_fixture_owner' || (state.user_id !== null && state.user_id !== '') ||
          (state.current_user_id !== null && state.current_user_id !== '')) fail();
        await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
        began = true;
        // Match runtime's epoch-before-identity lock order on this same transaction.
        const epoch = await client.query(`SELECT id FROM subtrack_auth.epoch
          WHERE id=$1 AND manifest_h=$2::subtrack_auth.h AND origin=$3 AND state='active' FOR UPDATE`,
        [captured.epoch, captured.manifestHash, captured.origin]);
        if (epoch.rows.length !== 1) fail();
        const owner = await client.query('SELECT id FROM public.identity WHERE id=$1::uuid AND auth_method=\'MOCK\' AND deleted_at IS NULL FOR UPDATE', [captured.ownerId]);
        if (owner.rows.length !== 1) fail();
        const nonce = await client.query('SELECT nonce_h FROM subtrack_auth.nonce WHERE nonce_h=$1::subtrack_auth.h AND purpose=\'session\' AND origin=$2 AND chain=$3 AND binding_h=$4::subtrack_auth.h AND epoch=$5 FOR UPDATE',
          [captured.nonceHash, captured.origin, captured.chain, captured.bindingHash, captured.epoch]);
        if (nonce.rows.length !== 1) fail();
        const now = clock();
        if (!Number.isSafeInteger(now) || now < 0) fail();
        const sessionId = randomUUID();
        const familyId = randomUUID();
        const refreshToken = `v2r.${randomBytes(32).toString('base64url')}`;
        const refreshHash = createHash('sha256').update('subtrack:auth-refresh:v2:', 'utf8').update(refreshToken, 'utf8').digest('hex');
        const csrf = mintDurableSessionCsrf();
        const issued = await client.query<{ ok: boolean }>(
          `SELECT subtrack_auth.issue_fixture($1::uuid,$2::uuid,$3::uuid,$4::subtrack_auth.h,
            $5::subtrack_auth.h,$6::subtrack_auth.h,$7::subtrack_auth.h,$8::text,$9::text,
            $10::text,$11::subtrack_auth.h,$12::subtrack_auth.ms) AS ok`,
          [captured.ownerId,sessionId,familyId,refreshHash,csrf.digest,captured.nonceHash,
            captured.bindingHash,captured.origin,captured.chain,captured.epoch,captured.manifestHash,now],
        );
        if (issued.rows.length !== 1 || issued.rows[0]?.ok !== true) fail();
        const accessToken = issueToken(captured.ownerId, sessionId);
        commitAttempted = true;
        const commit = await client.query('COMMIT');
        if (commit.command !== 'COMMIT') fail();
        const clean = await client.query(`SELECT session_user::text AS session_user,current_user::text AS current_user,
          pg_catalog.current_setting('app.user_id',true) AS user_id,
          pg_catalog.current_setting('app.current_user_id',true) AS current_user_id`);
        const after = clean.rows[0];
        if (clean.rows.length !== 1 || after?.session_user !== 'st233a_fixture_owner' ||
          after.current_user !== 'st233a_fixture_owner' || (after.user_id !== null && after.user_id !== '') ||
          (after.current_user_id !== null && after.current_user_id !== '')) fail();
        client.release();
        released = true;
        return Object.freeze({ accessToken, refreshToken, bindingCookie: captured.bindingCookie, csrfToken: csrf.token });
      } catch {
        if (began && !commitAttempted) {
          try { await client.query('ROLLBACK'); } catch { /* connection discarded */ }
        }
        return fail();
      } finally {
        if (!released) {
          try { client.release(new Error(FAILURE)); } catch { /* no credential disclosure */ }
        }
      }
    },
  });
}
